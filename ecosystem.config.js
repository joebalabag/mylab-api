/**
 * PM2 process config for mylab-api.
 *
 *   Start (production):  pm2 start ecosystem.config.js
 *                        pm2 start ecosystem.config.js --env production   (equivalent, explicit)
 *   Start (staging):     pm2 start ecosystem.config.js --env staging
 *   Persist across boot: pm2 save && pm2 startup systemd
 *
 * See deployment.md for the full Linux + nginx + Let's Encrypt walkthrough.
 */

module.exports = {
	apps: [
		{
			name: 'mylab-api',
			// `nest build` in this repo emits to dist/src/main.js because tsconfig.json
			// doesn't set rootDir — src/ + knexfile.ts + migrations/ + seeds/ share a
			// common root, so the compiler preserves the src/ prefix.
			script: 'dist/src/main.js',
			cwd: '/var/lib/jenkins/workspace/mylab-api',

			// One process by default. See "Cluster mode notes" at the bottom of the file
			// before bumping this: the hourly SUBSCRIPTION_PROMOTION_CRON and per-process
			// rate limiter both have implications.
			instances: 1,
			exec_mode: 'fork',

			// Default env applied on plain `pm2 start ecosystem.config.js` (production).
			env: {
				NODE_ENV: 'production',
				TZ: 'Asia/Manila',
			},

			// Env applied on `pm2 start ecosystem.config.js --env production`
			// (explicit form; same values as the default `env` above).
			env_production: {
				NODE_ENV: 'production',
				TZ: 'Asia/Manila',
			},

			// Env applied on `pm2 start ecosystem.config.js --env staging`.
			env_staging: {
				NODE_ENV: 'staging',
				TZ: 'Asia/Manila',
			},

			max_memory_restart: '512M',         // restart if RSS crosses this
			autorestart: true,
			watch: false,                       // never watch source in production
			min_uptime: '10s',                  // must stay up 10s to count as a good start
			max_restarts: 10,                   // give up if it crashes 10x within min_uptime

			merge_logs: true,
			time: true,                         // prefix log lines with timestamps

			// Log locations. PM2's defaults (~/.pm2/logs/…) are fine for a first deploy.
			// Uncomment the two lines below once /var/log/mylab-api exists and is writable
			// by the PM2 user (see deployment.md §5).
			// out_file:   '/var/log/mylab-api/out.log',
			// error_file: '/var/log/mylab-api/error.log',
		},
	],
};

/*
 * Cluster mode notes
 * ──────────────────
 * If you set `instances` > 1 and `exec_mode: 'cluster'`:
 *   • Every worker runs its own copy of SUBSCRIPTION_PROMOTION_CRON.
 *     Promotions are idempotent, so it's not dangerous — just noisier logs.
 *     To dedupe, gate the cron on a Redis lock or run it in only one worker.
 *   • @nestjs/throttler tracks limits per-process, not shared. Effective
 *     per-IP limit becomes (configured limit × instances). Fine for now
 *     since only /auth/* and /public/tenant/* are throttled (5/min).
 */
