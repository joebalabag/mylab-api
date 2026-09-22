import type { Knex } from 'knex';

/**
 * Adds the columns needed to identify records that originated on an offline
 * station and were later synced up:
 *
 *   client_uuid          — UUID generated on the device before sync. Lets a
 *                          repeated sync attempt land as an idempotent upsert
 *                          instead of a duplicate row.
 *   created_offline_at   — Device wall-clock at the moment of capture. Kept
 *                          separate from created_at (server clock at insert)
 *                          so audits can reconstruct "what really happened
 *                          when" if the branch was offline for days.
 *
 * Applied to the four tables that participate in the offline patient
 * transaction journey: patients, patient_cases, payments, lab_reports.
 *
 * Also flips on the tenant-level offline_mode_enabled gate so the feature can
 * be dark-launched per tenant. Default false — a tenant must explicitly opt
 * in from Settings before any station can enable offline mode.
 */
const OFFLINE_TABLES = ['patients', 'patient_cases', 'payments', 'lab_reports'] as const;

export async function up(knex: Knex): Promise<void> {
	for (const table of OFFLINE_TABLES) {
		await knex.schema.alterTable(table, (t) => {
			t.string('client_uuid').nullable();
			t.timestamp('created_offline_at', { useTz: true }).nullable();
		});

		// Unique per tenant, ignoring rows that were created online (client_uuid IS NULL).
		// Partial index keeps existing online-only rows unaffected.
		await knex.raw(`
			CREATE UNIQUE INDEX IF NOT EXISTS ${table}_tenant_client_uuid_uidx
			ON ${table} (tenant_uuid, client_uuid)
			WHERE client_uuid IS NOT NULL
		`);
	}

	await knex.schema.alterTable('tenants', (t) => {
		t.boolean('offline_mode_enabled').notNullable().defaultTo(false);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (t) => {
		t.dropColumn('offline_mode_enabled');
	});

	for (const table of OFFLINE_TABLES) {
		await knex.raw(`DROP INDEX IF EXISTS ${table}_tenant_client_uuid_uidx`);
		await knex.schema.alterTable(table, (t) => {
			t.dropColumn('created_offline_at');
			t.dropColumn('client_uuid');
		});
	}
}
