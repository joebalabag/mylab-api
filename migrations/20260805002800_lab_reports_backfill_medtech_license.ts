import type { Knex } from 'knex';

/**
 * One-off backfill — populate lab_reports.medtech_license for rows created
 * before the column existed by pulling the user's current license_number.
 * Only touches rows where the medtech user still exists AND the license
 * column is still NULL, so any manually-set value stays.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.raw(`
		UPDATE lab_reports lr
		SET medtech_license = u.license_number
		FROM users u
		WHERE lr.medtech_uuid = u.uuid
		  AND lr.medtech_license IS NULL
		  AND u.license_number IS NOT NULL
	`);
}

export async function down(_knex: Knex): Promise<void> {
	// No-op — data backfill only.
}
