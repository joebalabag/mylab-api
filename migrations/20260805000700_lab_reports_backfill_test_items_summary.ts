import type { Knex } from 'knex';

/**
 * One-off backfill of test_items_summary for any lab_reports created before
 * the column existed. Aggregates the child lab_report_items in insert order.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.raw(`
		UPDATE lab_reports lr
		SET test_items_summary = agg.summary
		FROM (
			SELECT lab_report_uuid,
			       string_agg(test_name, ', ' ORDER BY display_order, created_at) AS summary
			FROM lab_report_items
			GROUP BY lab_report_uuid
		) agg
		WHERE lr.uuid = agg.lab_report_uuid
		  AND (lr.test_items_summary IS NULL OR lr.test_items_summary = '')
	`);
}

export async function down(_knex: Knex): Promise<void> {
	// No-op — backfill only.
}
