import type { Knex } from 'knex';

/**
 * Retire the coarse `cashier / all-access` (nav 202) and
 * `laboratory / all-access` (nav 203) rows now that the fine-grained
 * replacements (210-213 and 220-226) are seeded + backfilled to every
 * user who previously had the coarse grant.
 *
 * Order matters — drop child grants in user_accesses BEFORE the parent
 * access_templates row, so any FK / ORM cache stays consistent.
 *
 * Idempotent: DELETE by navigation_id is a no-op if the row is already
 * gone. Down() cannot restore the rows (we don't know what user_accesses
 * grants existed) — a fresh seed run of 04_seed_access_templates.ts
 * won't re-create them either since they've been removed from ROWS.
 */
export async function up(knex: Knex): Promise<void> {
	await knex('user_accesses').whereIn('navigation_id', [202, 203]).delete();
	await knex('access_templates').whereIn('navigation_id', [202, 203]).delete();
}

export async function down(_knex: Knex): Promise<void> {
	// Irreversible — the fine-grained rows (210-213, 220-226) fully replace
	// the intent of the retired all-access grants.
}
