/**
 * Runs once before the jest e2e suite:
 *   1. Ensure the test database exists
 *   2. Run knex migrations on it
 *
 * All Nest app boots inside individual specs then connect to this DB.
 */
export default async function globalSetup() {
	process.env.NODE_ENV = 'test';
	process.env.TZ = 'Asia/Manila';

	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const dotenv = require('dotenv');
	dotenv.config({ path: '.env.test' });

	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { Client } = require('pg');
	const admin = new Client({
		host: process.env.DB_SERVER,
		port: Number(process.env.DB_PORT),
		user: process.env.DB_USER,
		password: process.env.DB_PASSWORD,
		database: 'postgres',
	});

	await admin.connect();
	const dbName = process.env.DB_DATABASE!;
	const result = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
	if (result.rowCount === 0) {
		// safe: dbName comes from our own .env.test, not user input
		await admin.query(`CREATE DATABASE "${dbName}"`);
		// eslint-disable-next-line no-console
		console.log(`[test] created database ${dbName}`);
	}
	await admin.end();

	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const knex = require('knex');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const knexConfig = require('../knexfile').default;
	const k = knex(knexConfig);
	await k.migrate.latest();
	await k.destroy();
}
