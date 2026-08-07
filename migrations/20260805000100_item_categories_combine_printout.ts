import type { Knex } from 'knex';

/**
 * Categories are the grouping unit for lab-report print-outs. When
 * `combine_printout` is true, all requisition items whose test_item belongs
 * to this category collapse into ONE lab_report (single lab number, single
 * print-out). When false, every test_item becomes its own lab_report. The
 * frontend uses this as the default in the Add Laboratory grouping step; the
 * operator can still override per requisition before confirming.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('item_categories', (table) => {
		table.boolean('combine_printout').notNullable().defaultTo(true);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('item_categories', (table) => {
		table.dropColumn('combine_printout');
	});
}
