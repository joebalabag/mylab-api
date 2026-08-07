import type { Knex } from 'knex';

/**
 * One-off data fix. Historical rows in lab_reports have `finalized_at`
 * timestamps that are earlier than their `created_at` (physically impossible),
 * likely from an early code path where the two calls landed out of order.
 * Clamp any offending row's finalized_at / voided_at to equal created_at so
 * the "Finalized <date>" line on the printout doesn't display a nonsense
 * timestamp that predates the report itself.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.raw(`
		UPDATE lab_reports
		SET finalized_at = created_at
		WHERE finalized_at IS NOT NULL AND finalized_at < created_at
	`);
	await knex.raw(`
		UPDATE lab_reports
		SET voided_at = GREATEST(created_at, COALESCE(finalized_at, created_at))
		WHERE voided_at IS NOT NULL AND voided_at < created_at
	`);
}

export async function down(_knex: Knex): Promise<void> {
	// No-op — data fix only.
}
