import type { Knex } from 'knex';

/**
 * Configurable "method" (e.g., "Qualitative Immunochromatographic Assay")
 * printed under the test name on the report; plus comma-separated
 * `lookup_values` that, when non-empty, cause the result editor to render a
 * dropdown (e.g., "Positive,Negative,Indeterminate"). Blank = free-text.
 *
 * Both fields are also snapshotted on the child lab records at create-time so
 * later edits to the catalog don't rewrite issued reports.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('test_items', (table) => {
		table.text('method').nullable();
		table.text('lookup_values').nullable();
	});
	await knex.schema.alterTable('test_item_components', (table) => {
		table.text('lookup_values').nullable();
	});
	await knex.schema.alterTable('lab_report_items', (table) => {
		table.text('method').nullable();
	});
	await knex.schema.alterTable('lab_result_values', (table) => {
		table.text('lookup_values').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_result_values', (table) => {
		table.dropColumn('lookup_values');
	});
	await knex.schema.alterTable('lab_report_items', (table) => {
		table.dropColumn('method');
	});
	await knex.schema.alterTable('test_item_components', (table) => {
		table.dropColumn('lookup_values');
	});
	await knex.schema.alterTable('test_items', (table) => {
		table.dropColumn('lookup_values');
		table.dropColumn('method');
	});
}
