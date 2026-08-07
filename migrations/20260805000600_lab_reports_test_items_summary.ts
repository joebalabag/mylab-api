import type { Knex } from 'knex';

/**
 * Snapshotted comma-separated list of the test names included in the report.
 * Populated at createBatch time so the dashboard can show "what's in this
 * lab" without joining back to lab_report_items or patient_requisition_items.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_reports', (table) => {
		table.text('test_items_summary').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_reports', (table) => {
		table.dropColumn('test_items_summary');
	});
}
