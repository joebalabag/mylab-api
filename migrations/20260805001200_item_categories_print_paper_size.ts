import type { Knex } from 'knex';

/**
 * Paper size for a category's printed lab report. Choices intentionally kept
 * small to keep the print CSS branching simple:
 *   full        → A4 portrait (default)
 *   half        → A5 portrait
 *   letter      → US Letter portrait
 *   half_letter → US Half Letter portrait
 *
 * Read at doPrint() time to emit @page size = <mapped>.
 */
export async function up(knex: Knex): Promise<void> {
	const has = await knex.schema.hasColumn('item_categories', 'print_paper_size');
	if (!has) {
		await knex.schema.alterTable('item_categories', (table) => {
			table.string('print_paper_size', 20).nullable();
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('item_categories', (table) => {
		table.dropColumn('print_paper_size');
	});
}
