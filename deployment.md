# Deployment — Linux + PM2 + nginx (Jenkins-driven)

This guide walks through a first-time production deploy of `mylab-api` on
Ubuntu 22.04/24.04. Builds are driven from a **Jenkins** workspace on the
host (`/var/lib/jenkins/workspace/mylab-api`); PM2 runs the compiled
NestJS process, nginx reverse-proxies HTTPS on
`https://api-mylab.edgetechph.net` down to it.

Adapt for other distros where the package manager differs.

## Table of contents

1. [Server prerequisites](#1-server-prerequisites)
2. [PostgreSQL setup](#2-postgresql-setup)
3. [Clone and configure the app](#3-clone-and-configure-the-app)
4. [Build and migrate](#4-build-and-migrate)
5. [PM2 ecosystem file](#5-pm2-ecosystem-file)
6. [nginx reverse proxy](#6-nginx-reverse-proxy)
7. [HTTPS with Let's Encrypt](#7-https-with-lets-encrypt)
8. [Firewall](#8-firewall)
9. [Trust the proxy inside Nest](#9-trust-the-proxy-inside-nest)
10. [Deploy checklist for future updates](#10-deploy-checklist-for-future-updates)
11. [Gotchas](#gotchas)

---

## 1. Server prerequisites

```bash
# Node 20 (project targets Node 20+; TypeScript 5.7 + NestJS 11 supported)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 process manager
sudo npm install -g pm2

# PostgreSQL 15 (or use a managed DB — DigitalOcean, RDS, etc.)
sudo apt-get install -y postgresql-15 postgresql-contrib

# nginx + certbot for HTTPS
sudo apt-get install -y nginx certbot python3-certbot-nginx

# git and build tools (bcrypt + tesseract-native + sharp have native deps)
sudo apt-get install -y git build-essential python3
```

Jenkins itself (if not already installed) can go under
`/var/lib/jenkins`; the pipeline used by this repo checks the source
into `/var/lib/jenkins/workspace/mylab-api` and builds in place.

## 2. PostgreSQL setup

```bash
sudo -u postgres psql <<SQL
CREATE ROLE mylab WITH LOGIN PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE mylab OWNER mylab;
GRANT ALL PRIVILEGES ON DATABASE mylab TO mylab;
-- Extension needed for uuid_generate_v4() used in every migration
\c mylab
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL
```

For a **staging** DB alongside prod on the same box, repeat with
`mylab_staging` / a distinct role. This lets schemas drift safely
during testing.

## 3. Clone and configure the app

Manual (equivalent to what Jenkins does):

```bash
sudo mkdir -p /var/lib/jenkins/workspace
sudo chown $USER:$USER /var/lib/jenkins/workspace
cd /var/lib/jenkins/workspace
git clone https://github.com/joebalabag/mylab-api.git
cd mylab-api

npm ci                              # respects package-lock.json exactly
cp .env.example .env.production     # then fill in the real values
$EDITOR .env.production
```

Values to fill in `.env.production`:

| Var | Notes |
|---|---|
| `PORT` | Local port only nginx will reach (e.g. `7040`). Don't expose it externally. |
| `TZ` | Keep `Asia/Manila` in .env so migrations + responses agree on timezone. |
| `DB_*` | Credentials created in step 2. |
| `JWT_SECRET` | Generate one: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`. **Rotating this later invalidates every issued JWT AND every printed lab-report QR link — set it once, keep it stable.** |
| `SMTP_*` | Your mail provider (Gmail app-password → port 587 with `SMTP_SECURE=false`). |
| `APP_URL` | Public URL of the FRONTEND, used in email links (e.g. `https://mylab.edgetechph.net`). |
| `CORS_ORIGINS` | Comma-separated list of allowed frontend origins (e.g. `https://mylab.edgetechph.net`). |
| `PAYPAL_*` | Only if you enable the Subscription page's PayPal Smart Button. `PAYPAL_ENV=live` in prod. |

## 4. Build and migrate

```bash
npm run build:production
npm run migrate-latest:production
npm run seed-latest:production      # default super admin: admin / admin123 — CHANGE IT
```

Create the `public/uploads/` tree so the app can write user uploads to
it:

```bash
mkdir -p public/uploads
chmod 755 public
```

## 5. PM2 ecosystem file

`ecosystem.config.js` is committed at the project root. Key defaults it
ships with:

- `name: 'mylab-api'`
- `script: 'dist/src/main.js'` (nest build emits under `dist/src/`
  because `tsconfig.json` doesn't set `rootDir` — the compiler keeps the
  `src/` prefix).
- `cwd`: `/var/lib/jenkins/workspace/mylab-api` for the Jenkins-driven
  deploy. Change if you deploy from a different path.
- `instances: 1`, `exec_mode: 'fork'`
- Default `env` → `NODE_ENV=production`, `TZ=Asia/Manila` (applied when
  no `--env` flag is passed).
- `env_production` block → `NODE_ENV=production`, `TZ=Asia/Manila`
  (activated with `--env production` — explicit equivalent of the
  default).
- `env_staging` block → `NODE_ENV=staging`, `TZ=Asia/Manila` (activated
  with `--env staging`).
- Guards: `max_memory_restart: '512M'`, `min_uptime: '10s'`,
  `max_restarts: 10`.
- Logs go to PM2's defaults (`~/.pm2/logs/`) until you uncomment the
  `/var/log/mylab-api/...` lines in the file.

Two scaling notes:

- **Cluster mode + hourly cron** — if `instances > 1`, every worker runs
  its own copy of `SUBSCRIPTION_PROMOTION_CRON`. Not dangerous
  (promotions are idempotent) but noisy. Stick to `instances: 1` unless
  you gate the cron with a Redis lock.
- **Rate limiter** — throttling is per-process. Multiple instances
  multiply the effective limits. Fine for auth (5/min × 2 workers =
  10/min effective), but keep it in mind.

### Optional — write logs to `/var/log/mylab-api`

```bash
sudo mkdir -p /var/log/mylab-api && sudo chown $USER:$USER /var/log/mylab-api
```

Then uncomment the `out_file` / `error_file` lines in
`ecosystem.config.js`.

### First-time start (production)

```bash
pm2 start ecosystem.config.js                    # implicit — uses `env` block
pm2 start ecosystem.config.js --env production   # explicit — uses `env_production` block (equivalent)
pm2 save                            # persist running apps across reboots
pm2 startup systemd                 # prints a sudo command — run it to enable auto-start on boot
```

### Starting with the staging env

```bash
pm2 start ecosystem.config.js --env staging
```

`--env staging` merges the `env_staging` block into the process env so
Nest loads `.env.staging`. Verify with:

```bash
pm2 logs mylab-api --lines 5
# expect: "Application is running on ENV: staging"
```

### If PM2 is already running with other apps

| State before | Result |
|---|---|
| No app named `mylab-api` in `pm2 list` | Added alongside your other apps and spawned. Other apps untouched. |
| `mylab-api` already `online` | PM2 says "process is already online" and does nothing. Env doesn't switch on its own. |
| `mylab-api` exists but `stopped` / `errored` | Restarted with the config from the file. |

To switch an already-running instance from production → staging:

```bash
pm2 restart mylab-api --update-env      # re-reads env (uses whichever --env you last passed)
# ...or, explicit:
pm2 delete mylab-api
pm2 start ecosystem.config.js --env staging
```

Always finish with `pm2 save` so the new full list survives reboots.

### Running staging and production side-by-side on the same box

Two things to change per env:

1. Different `PORT` values in `.env.production` and `.env.staging`
   (otherwise the second app crashes with `EADDRINUSE`).
2. Different PM2 names (otherwise the second `pm2 start` sees "already
   online" and does nothing).

Simplest — override the name from the CLI:

```bash
pm2 start ecosystem.config.js --env production                       # name: mylab-api
pm2 start ecosystem.config.js --env staging --name mylab-api-staging
pm2 save
```

Then give each a distinct nginx `server_name` (e.g. `api-mylab.…` and
`staging-api-mylab.…`) pointing at the matching port.

### Common commands

```bash
pm2 list                            # all apps + statuses
pm2 logs mylab-api --lines 200      # tail
pm2 monit                           # live CPU / RAM / restarts
pm2 restart mylab-api               # cold restart (fork mode)
pm2 reload mylab-api                # zero-downtime (cluster mode only)
pm2 stop mylab-api                  # keep in list but stopped
pm2 delete mylab-api                # remove from list entirely
```

## 6. nginx reverse proxy

`/etc/nginx/sites-available/mylab-api`:

```nginx
upstream mylab_api {
    server 127.0.0.1:7040;          # matches PORT in .env.production
    keepalive 32;
}

# HTTP → HTTPS redirect (certbot fills the cert later)
server {
    listen 80;
    listen [::]:80;
    server_name api-mylab.edgetechph.net;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api-mylab.edgetechph.net;

    # certbot will inject the ssl_certificate lines here.
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 20M;       # room for payment slips, lab-header banners, doctor sigs, and finalized-report PDFs emailed to patients

    # gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1024;

    # Serve /public/ (user uploads) directly for speed. This includes
    # tenant logos, doctor e-signatures, subscription payment slips, and
    # OCR-preview receipts.
    location /public/ {
        alias /var/lib/jenkins/workspace/mylab-api/public/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        try_files $uri =404;
    }

    # Everything else goes to Node.
    location / {
        proxy_pass         http://mylab_api;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "";
        proxy_read_timeout 300;
        proxy_send_timeout 300;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/mylab-api /etc/nginx/sites-enabled/
sudo nginx -t                       # syntax check
sudo systemctl reload nginx
```

## 7. HTTPS with Let's Encrypt

DNS must already point `api-mylab.edgetechph.net` at the server's public
IP.

```bash
sudo certbot --nginx -d api-mylab.edgetechph.net \
     --agree-tos -m you@example.com --redirect
```

Auto-renewal is installed by default (`/etc/cron.d/certbot`). Verify
with `sudo certbot renew --dry-run`.

## 8. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'         # opens 80 + 443
sudo ufw enable
```

Postgres (`5432`) and the Node port (`7040`) stay closed from the
outside — nginx and localhost only.

## 9. Trust the proxy inside Nest

Rate limiting keys off client IP. Behind nginx, every request looks like
it came from `127.0.0.1` unless Express trusts `X-Forwarded-For`. Ensure
`src/main.ts` has:

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule, { ... });
app.set('trust proxy', 1);          // ← before useGlobalPipes()
```

Rebuild and `pm2 reload mylab-api`. Without this, the 5/min login
limiter would be shared across every client — one attacker could lock
everyone out.

## 10. Deploy checklist for future updates

Jenkins pipeline handles this automatically; the manual equivalent
production sequence:

```bash
cd /var/lib/jenkins/workspace/mylab-api
git pull
npm ci                              # only if package-lock.json changed
npm run build:production
npm run migrate-latest:production   # only if there are new migrations
pm2 reload mylab-api                # zero-downtime in cluster mode; restart in fork mode
# If you added new env vars to .env.production:
#   pm2 restart mylab-api --update-env
```

Staging (same shape, different scripts + name):

```bash
cd /var/lib/jenkins/workspace/mylab-api
git pull
npm ci
npm run build:staging
npm run migrate-latest:staging
pm2 reload mylab-api-staging        # if you named it -staging (see §5)
```

A minimal Jenkinsfile that automates the same:

```groovy
pipeline {
  agent any
  stages {
    stage('Checkout') { steps { git url: 'https://github.com/joebalabag/mylab-api.git', branch: 'main' } }
    stage('Install')  { steps { sh 'npm ci' } }
    stage('Build')    { steps { sh 'npm run build:production' } }
    stage('Migrate')  { steps { sh 'npm run migrate-latest:production' } }
    stage('Reload')   { steps { sh 'pm2 reload mylab-api || pm2 start ecosystem.config.js --env production' } }
  }
}
```

## Gotchas

- **Static files:** `main.ts` uses `useStaticAssets(publicDir, { prefix: '/public/' })`.
  The nginx `/public/` block above bypasses Node entirely for uploaded
  files — faster, and nginx sets cache headers Node doesn't. If you skip
  the nginx block, the app still serves them, just slower.
- **Swagger in prod:** `/api-docs` is publicly reachable. If you'd
  rather hide it in production, gate it in `main.ts`:
  ```ts
  if (process.env.NODE_ENV !== 'production') SwaggerModule.setup(...);
  ```
- **CORS:** honored dynamically from `CORS_ORIGINS` env. In production
  set it to the exact frontend origin(s) — do NOT leave it as `*` for a
  live SaaS.
- **Tesseract OCR:** the first receipt-upload request downloads the
  ~10 MB English trained data into a cache directory. Make sure the PM2
  user has write access to the project dir.
- **JWT_SECRET is load-bearing twice** — it signs both auth tokens and
  the HMAC token embedded in printed lab-report QR codes. Rotating it
  invalidates all issued sessions AND every already-printed QR link.
  Set it once, keep it stable.
- **Backup:** cover both halves — `pg_dump mylab > backup-$(date +%F).sql`
  on a schedule, and rsync `/var/lib/jenkins/workspace/mylab-api/public/uploads/`
  off-box. Uploads aren't in Postgres.
- **PayPal webhook** — if `PAYPAL_WEBHOOK_ID` is blank, incoming webhook
  posts are dropped (safe by default). Set it once you register the
  webhook URL with PayPal:
  `https://api-mylab.edgetechph.net/api/public/paypal/webhook`.
- **PM2 as root vs. as app user:** run PM2 under a dedicated non-root
  user (e.g. `www-data` or the `jenkins` user itself) whenever possible.
  `pm2 startup systemd -u jenkins --hp /var/lib/jenkins` sets that up
  when Jenkins is the owner.
- **Log rotation:** install `pm2 install pm2-logrotate` (or use OS
  `logrotate`) so `/var/log/mylab-api/*.log` doesn't fill the disk.
- **Timezone drift:** the app is designed around **Asia/Manila**. Both
  `.env` (`TZ`) and PM2's env blocks set it. If you deploy to a UTC-only
  container platform, keep the `TZ` env var explicitly — some report
  bucketing depends on the process's local time.

---

### Running staging on the same box — extras

The PM2 / `.env.staging` / nginx pieces are covered in
[§5 — Running staging and production side-by-side](#running-staging-and-production-side-by-side-on-the-same-box).
One more layer worth adding on top:

- Give staging its own Postgres database (`mylab_staging`) so schemas can
  diverge safely during testing. Repeat the step 2 SQL with a different
  database + role name, and point `.env.staging`'s `DB_DATABASE` /
  `DB_USER` at it.

---

*MyLab API · Deployment (Linux + PM2 + nginx, Jenkins-driven)*
