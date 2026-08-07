import type { Knex } from 'knex';

/**
 * Backfill: any item_category with a NULL print_paper_size gets set to
 * `letter` so the print dialog defaults to short bond for every category,
 * not just the standard-catalog ones. Complements 20260805001400 which
 * only touched rows with a previous non-null value.
 */
export async function up(knex: Knex): Promise<void> {
	await knex('item_categories').whereNull('print_paper_size').update({ print_paper_size: 'letter' });

	// Re-apply the "Laboratory" name rule in case any of the just-defaulted
	// rows happen to match the label.
	await knex('item_categories')
		.whereRaw(`LOWER(TRIM(name)) IN ('clinical laboratory', 'laboratory')`)
		.update({ print_paper_size: 'half_letter' });
}

export async function down(_knex: Knex): Promise<void> {
	// No-op.
}
