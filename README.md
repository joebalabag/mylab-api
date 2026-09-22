# MyLab API

Multi-tenant NestJS backend for **MyLab**, a laboratory management system
for clinical labs. Powers patient records, hierarchical test catalogs,
lab requisitions and result encoding, e-signed lab reports with QR-linked
public views, payment collection (8 methods), tenant subscription billing
with receipt-slip OCR and PayPal, granular per-user access control,
self-service tenant onboarding with email verification, and reporting.

Companion frontend: [`mylab-web`](https://github.com/joebalabag/mylab-web)
(source of this repo's sibling `laboratory/` folder).

## Stack

- **NestJS 11** on Express
- **TypeScript 5.7**, Node 20+
- **PostgreSQL** via **Knex 3** (query builder / migrations) +
  **Objection.js 3** (ORM)
- **bcrypt** for password hashing (salt = `keycode`, hash = `passphrase`)
- **JWT** auth (Passport) — also used to HMAC-sign the public lab-report
  QR tokens
- **@nestjs/schedule** for cron jobs (hourly subscription promotion sweep)
- **@nestjs/throttler** for per-IP rate limiting on auth + public
  registration + public plan lookups + PayPal webhook
- **nodemailer + email-templates + ejs** for transactional emails
  (verification, welcome, payment-submitted, payment-approved,
  payment-rejected)
- **Swagger** at `/api-docs`
- **class-validator + class-transformer** for DTO validation (property
  names in error messages are unwrapped to human-friendly form:
  `contact_number` → `contact number`)
- **Multer** for file uploads (logos, lab-report headers, doctor
  e-signatures, payment slips, subscription-plan QR codes)
- **Tesseract.js** for free, in-process OCR on payment slips
- **PayPal REST SDK** (opt-in via env) for the Subscription page's Smart
  Button flow, with webhook fallback
- **Jest** + **supertest** for tests

## Setup

```bash
npm install
# copy .env.example to .env.local and fill in the values
npm run migrate-latest       # apply all Knex migrations
npm run seed-latest          # default super admin: admin / admin123 — CHANGE IT
npm run start                # http://localhost:3010 — Swagger at /api-docs
```

The default seed also plants a standard laboratory catalog (5 item
groups, 20+ item categories, hundreds of test items) tenants can import
via the frontend's `Item Groups → Import pre-loaded catalog` button (or
the `POST /item-group/import-preloaded` endpoint).

### Environment (`.env.local`, `.env.staging`, `.env.production`)

`.env.example` is committed as the reference template. `.env.*` files
are gitignored — fill them per environment.

```
NODE_ENV=local
TZ=Asia/Manila
PORT=3010

# Database
DB_SERVER=127.0.0.1
DB_USER=postgres
DB_PASSWORD=…
DB_DATABASE=mylab
DB_PORT=5432

# Auth
JWT_SECRET=…                          # generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_EXPIRES_IN=1d

# Payment-slip OCR
#   tesseract → free, in-process (default)
#   none      → skip extraction
AI_VISION_PROVIDER=tesseract

# Cron — hourly subscription promotion sweep
SUBSCRIPTION_PROMOTION_CRON=0 * * * *

# SMTP (leave blank in dev → mailer logs to console instead of sending)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false                     # true when using port 465
SMTP_USER=…
SMTP_PASSWORD=…
SMTP_FROM=

# Base URL of the frontend — used in verification / notification email links
APP_URL=http://localhost:5173

# CORS — comma-separated origins allowed to call the API.
# Fallback (built-in) includes localhost:5173/3000/3010, 127.0.0.1:3010,
# and http(s)://mylab.edgetechph.net.
CORS_ORIGINS=http://localhost:5173,https://mylab.edgetechph.net

# PayPal (optional — leave blank to disable the Smart Button flow)
PAYPAL_ENV=sandbox                    # 'sandbox' or 'live'
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=                    # required for webhook verification; if blank, incoming webhooks are dropped
```

### Tests

```bash
npm run test              # unit specs
npm run test:e2e          # e2e suites against the test DB (NODE_ENV=test)
```

`test/global-setup.ts` auto-creates the test DB if missing and runs
migrations.

## API surface

All endpoints live under `/api`. Every response uses the envelope
`{ response, message, status, warnings? }` — see
[Response envelope](#response-envelope).

Two authenticated consoles + a public surface:

- **Staff (tenant)** — `POST /auth/user/login` → JWT. Everything under
  `/patient/*`, `/patient-case/*`, `/patient-requisition/*`,
  `/lab-report/*`, `/payment/*`, `/test-item/*`, `/item-*/*`,
  `/discount/*`, `/expense/*`, `/user/*`, `/doctor/*`, `/tenant/*`
  (self-scoped), `/subscription-plan/*` (view + own subscription),
  `/tenant-subscription-payment/*`, `/reports/*`, `/analytics/*`,
  `/access-template/*`, `/user-access/*`, `/setup-readiness/*`,
  `/ai-extraction/*`.
- **Super admin (platform)** — `POST /auth/admin/login` → JWT. Adds
  `/admin/*`, cross-tenant `/tenant/*` mutations,
  `/subscription-plan/*` (write), and the approve/reject actions on
  `/tenant-subscription-payment/*`.
- **Public** — no auth. `POST /public/tenant/register`,
  `POST /public/tenant/verify`, `POST /public/tenant/resend-verification`
  (all rate-limited), `GET /public/subscription-plan/trials`,
  `GET /public/subscription-plan/list`, `GET /lab-report/public/view?t=…`
  (HMAC-verified QR link), `POST /public/paypal/webhook` (PayPal
  signature-verified).

### Response envelope

```json
{
  "response": { "…": "…" },
  "message": "Human-readable text",
  "status": 200,
  "warnings": [
    { "code": "notification.skipped.no-email",
      "text": "Owner not notified — tenant has no contact email.",
      "meta": { "…": "…" } }
  ]
}
```

- Built by `src/common/helpers/response.helper.ts`.
- All `Date` values are converted to ISO strings in **Asia/Manila** on
  the way out (`YYYY-MM-DD HH:mm:ss+08:00`).
- `warnings[]` is only included when non-empty.

### Auth headers

Every non-public endpoint expects:

```
Authorization: Bearer <access_token>
```

Tokens are issued at login and carry `{ type: 'admin' | 'user', uuid,
username, name, email, role, tenant_uuid? }`.

### Rate limits

- `POST /auth/admin/login` — **5 / minute** per IP.
- `POST /auth/user/login` — **5 / minute** per IP.
- `POST /auth/verify-manager` — **10 / minute** per IP.
- `POST /public/tenant/register` — **5 / minute** per IP.
- `POST /public/tenant/resend-verification` — **5 / minute** per IP.
- `GET  /public/subscription-plan/trials` — **30 / minute**.
- `GET  /public/subscription-plan/list` — **60 / minute**.
- `POST /public/paypal/webhook` — **120 / minute**.

The limiter is per-process; if you scale beyond `instances: 1` the
effective limits multiply. Consider a Redis-backed limiter before
scaling out.

## Feature modules

The app is split into feature modules under `src/app/*`. Each module
follows the same `module + controller + service + dto` shape.

- **auth** — JWT/Passport login (staff + super admin), manager
  verification (voids)
- **admin** — Super admin CRUD, dashboard reset, self password change
- **user** — Tenant user CRUD (role-scoped listing), dashboard reset,
  self password change
- **tenant** — Tenant master CRUD, logo + lab-report-header image
  upload, subscription override (`alter-subscription`)
- **tenant-registration** — Public self-serve registration, email
  verification, trial onboarding
- **subscription-plan** — Plan definitions (price, duration,
  allowed_modules, max_terminals, is_trial), QR-per-plan upload, public
  read endpoints for the landing / subscription pages
- **tenant-subscription-payment** — Payment upload + OCR-assisted intake,
  admin approve/reject, PayPal order create + capture, PayPal webhook
- **tenant-subscription-history** — Subscription lifecycle log
  (scheduled → active → expired)
- **access-template** — Navigation catalog (main_navigation +
  sub_navigation) that drives the Assign Access modal
- **user-access** — Per-user overrides of the template grants
- **item-group / item-category / test-item / item-package** — Lab test
  catalog (hierarchical: Group → Category → Item; Packages bundle items)
- **patient** — Patient master, duplicate-check search, MRN
  auto-generation (`P-NNNNNN`)
- **patient-case** — Visit/encounter grouping (case_type, case_date)
- **patient-requisition** — Lab order from doctor/referring physician;
  line items are test_items + item_packages; bulk items sync +
  requisition-level discount
- **lab-report** — Result encoding (5 result types), medtech +
  pathologist e-signatures, finalization, HMAC-signed public QR view,
  batch creation from paid requisitions
- **doctor** — Referring physician / signatory registry with e-signature
  image upload
- **payment** — Cashier collection (cash, e-wallet, bank transfer, A/R,
  insurance, paid outside, charity, other); arrangements resolution;
  unpaid-case + unpaid-item lookups
- **discount** — Global discount rules (fixed / percent)
- **expense** — Lab operating expenses with void trail
- **ai-extraction** — Payment-slip OCR preview (Tesseract in-process),
  returns `{ file_url, extraction }` for the Subscription page to
  auto-fill
- **analytics** — Dashboard widgets (revenue summary, revenue trend,
  method breakdown, receivables aging, throughput, top items,
  profitability)
- **reports** — 12 report endpoints backing the frontend's Reports
  screens (summary, monthly-sales, monthly-tests, daily-sales,
  daily-tests, daily-detailed-sales, cashier-sales, voids, discounts,
  expenses, payment-summary, test-analytics {volume, categories, TAT})
- **setup-readiness** — Onboarding checklist (`GET /setup-readiness/status`)
- **mail-test** — Dev-only SMTP debug endpoint

## Database

- **PostgreSQL** with **Knex** migrations under `migrations/` and
  **Objection.js** models under `src/app/*/*.model.ts`.
- **Extension required**: `uuid-ossp` (used by every migration for
  `uuid_generate_v4()`). The deployment guide's `CREATE EXTENSION` line
  handles this.
- **Multi-tenancy**: single-schema PostgreSQL with tenant-scoped rows.
  Every tenant-owned table has a `tenant_uuid` FK to `tenants(uuid)`
  with `ON DELETE CASCADE`. Services scope every query by the
  authenticated tenant's uuid.
- **Seeds** (`seeds/`):
  - `01_seed_admin.ts` — default super admin (`admin` / `admin123`).
  - `04_seed_access_templates.ts` — navigation catalog rows.
  - `05_seed_tenant_joebalabag.ts` — sample tenant for local dev.
  - `06_seed_lab_groups_categories.ts` +
    `07_seed_test_items.ts` +
    `09_seed_standard_catalog_for_all_tenants.ts` — the standard MyLab
    laboratory catalog (importable per-tenant via the API).

## File uploads

Static assets served under `/public/*`. Upload subfolders:

| Purpose | Path | Limit |
|---|---|---|
| Tenant company logo | `public/uploads/tenants/logo/YYYY/MM/` | 5 MB (image) |
| Tenant lab-report header banner | `public/uploads/tenants/lab-header/YYYY/MM/` | 5 MB (image) |
| Doctor e-signature | `public/uploads/tenants/doctor-esignature/YYYY/MM/` | 5 MB (image) |
| Subscription-plan payment QR | `public/uploads/subscription-plans/qrcode/YYYY/MM/` | 5 MB (image) |
| Subscription-payment slip | `public/uploads/tenants/subscription-payments/YYYY/MM/` | 10 MB (image) |
| OCR-preview receipt (transient) | `public/uploads/ai-extraction/receipts/YYYY/MM/` | 10 MB (image) |

All accept jpg/jpeg/png/webp/gif/svg via `imageFileFilter`. Custom
Multer storage (`makeUploadStorage`, `makeFieldRoutedStorage`) buckets
files by `YYYY/MM` so a folder never grows too big.

## Cron

One scheduled job: `promoteScheduled` in
`src/app/tenant-subscription-payment/tenant-subscription-payment.cron.ts`.

- **Schedule**: `process.env.SUBSCRIPTION_PROMOTION_CRON` (default
  `0 * * * *` — hourly).
- **What it does**: any tenant subscription with status `scheduled` and
  a `start_date` that has arrived gets promoted to `active`. This
  supports scheduled upgrades (pay today, activate on a future date).
- Registered on module init via `@nestjs/schedule`'s `SchedulerRegistry`.

## Email templates

Under `src/common/mailer/templates/`. Each template has a
`subject.ejs` + `html.ejs` and inherits from `layout/_base.ejs`.

- `verification/` — sent after `POST /public/tenant/register`; contains
  the verification link back to the frontend.
- `welcome/` — sent after `POST /public/tenant/verify` succeeds; carries
  the seeded admin username + password.
- `payment-submitted/` — admin notification when a tenant uploads a
  subscription payment.
- `payment-approved/` — tenant notification when a super admin approves.
- `payment-rejected/` — tenant notification when a super admin rejects
  (with reason).
- `test/` — dev SMTP debug email.

When SMTP is not configured (blank `SMTP_HOST`), mails are logged to the
console instead of sent — useful for local dev.

## Public QR link (lab reports)

Finalized lab reports print a QR code that resolves to
`GET /lab-report/public/view?t=<signed-token>`. The token is:

- HMAC-signed with `JWT_SECRET`.
- Verified server-side on every request — no auth header needed but
  tampering with the URL bounces with an error.
- Rendered read-only by the frontend at
  `https://mylab.example.com/lab/view?…` (`PublicLabReportView.vue`).

Regenerate `JWT_SECRET` in production once — before any patients have
been given printed QR-linked reports — and never again, because old QR
prints will stop verifying. This is the same secret used for JWT
issuance, so rotating it also invalidates every active staff/admin
session.

## Deployment

For production / staging deployment on Linux with PM2 + nginx (Jenkins
workspace path `/var/lib/jenkins/workspace/mylab-api`, deployed origin
`https://api-mylab.edgetechph.net`), see
**[deployment.md](./deployment.md)** — covers Node install, PostgreSQL
setup, `.env.production` values, `ecosystem.config.js`, nginx reverse
proxy, Let's Encrypt HTTPS, firewall, `trust proxy` inside Nest, and
future-update checklist.


## Description

  One-liner (tagline)

  MyLab — a browser-based laboratory management system for Philippine clinical labs.

  ---
  Short description (~60 words)

  MyLab is a multi-tenant, PWA-ready laboratory information system for clinical labs. It handles patients, cases, requisitions,
  cashiering with 8 payment methods, and full result encoding (single, panel, narrative, culture, matrix) with medtech + pathologist
  e-signatures. Finalized reports are printable and shareable via a QR-linked, HMAC-verified public view — no login required.

  ---
  Full listing description (~300 words)

  MyLab is an end-to-end laboratory management system built for Philippine clinical laboratories. Delivered as a fast Vue 3 progressive
   web app backed by a NestJS + PostgreSQL API, it runs on any modern browser and installs to desktop or mobile like a native app.

  What it does

  MyLab — a browser-based laboratory management system for Philippine clinical labs.

  ---
  Short description (~60 words)

  MyLab is a multi-tenant, PWA-ready laboratory information system for clinical labs. It handles patients, cases, requisitions,
  cashiering with 8 payment methods, and full result encoding (single, panel, narrative, culture, matrix) with medtech + pathologist
  e-signatures. Finalized reports are printable and shareable via a QR-linked, HMAC-verified public view — no login required.

  ---
  Full listing description (~300 words)

  MyLab is an end-to-end laboratory management system built for Philippine clinical laboratories. Delivered as a fast Vue 3 progressive
   web app backed by a NestJS + PostgreSQL API, it runs on any modern browser and installs to desktop or mobile like a native app.

  What it does

  - Patient & case management — Patient master with duplicate-check search-first UX, auto-generated MRNs, and a case grouping model
  that ties every visit's requisitions, payments, and lab reports together.
  - Test catalog — Hierarchical item groups, categories, individual test items, and bundled packages. Ships with a pre-loaded
  Philippine lab catalog (5 groups, 20+ categories, hundreds of tests) importable in one click.
  - Cashier — Finalize requisitions and collect payment through 8 methods: cash, e-wallet (GCash / Maya / GrabPay), bank transfer, A/R,
   insurance, paid outside, charity/waived, and other. Manager-password void controls included.
  - Laboratory — Result encoding with 5 result types (single value, panel, narrative, culture & sensitivity, matrix), automatic
  reference-range validation, and a two-stage medtech → pathologist e-signing workflow.
  - QR-verified reports — Every finalized report prints with a QR code linking to a signed, read-only public view — patients and
  doctors can verify authenticity without an account.
  - Reports & dashboard — 12 built-in reports plus a live KPI dashboard covering revenue, receivables, and test throughput.
  - Self-service onboarding — Tenants sign up, verify email, pick a plan, and pay via GCash, bank transfer, or PayPal. Uploaded
  receipts are auto-read by on-device OCR to prefill the payment form.
  - Granular access control — Per-user access templates so each staff role only sees what they should.

  Tech: Vue 3 · Pinia · Tailwind · NestJS 11 · PostgreSQL · JWT · PWA · PayPal · Tesseract OCR.