import type { Knex } from 'knex';

/**
 * Flips `tenants.offline_mode_enabled` to on-by-default and backfills every
 * existing tenant to `true`. The initial migration
 * (20260902000100_offline_mode_columns) shipped with `defaultTo(false)` so
 * offline mode could be dark-launched per tenant; product decision changed
 * to "on for everyone" during rollout — this migration is the follow-up.
 *
 * The column itself stays: an admin still needs a switch to turn offline
 * mode off for a specific tenant if their local cache ever gets into a bad
 * state, or if we ever ship a paid tier that gates this feature.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (t) => {
		t.boolean('offline_mode_enabled').notNullable().defaultTo(true).alter();
	});
	// Backfill — the DEFAULT change alone doesn't rewrite existing rows.
	await knex('tenants').update({ offline_mode_enabled: true });
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (t) => {
		t.boolean('offline_mode_enabled').notNullable().defaultTo(false).alter();
	});
	// No un-backfill — we don't know which tenants were manually enabled
	// vs. defaulted, so leaving existing values as-is is safer.
}
