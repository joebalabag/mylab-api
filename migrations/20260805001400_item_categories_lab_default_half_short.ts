import type { Knex } from 'knex';

/**
 * Refine the paper-size defaults per operator convention:
 *
 *   ALL item_categories default to `letter` (regular short bond 8.5" × 11").
 *   Categories named "Clinical Laboratory" or "Laboratory" (case-insensitive
 *   match, whitespace-tolerant) default to `half_letter` (5.5" × 8.5").
 *
 * Only touches rows whose current print_paper_size is one of the older
 * seeded values (`full`, `half`, `half_letter`) or NULL — so any category
 * the user has already customized keeps its manual choice.
 */
export async function up(knex: Knex): Promise<void> {
	// Step 1: reset any lingering standard-catalog rows back to `letter`.
	await knex('item_categories')
		.whereRaw(`COALESCE(print_paper_size, '') IN ('full', 'half', 'half_letter')`)
		.update({ print_paper_size: 'letter' });

	// Step 2: promote the two "Laboratory" category names to half short bond.
	await knex('item_categories')
		.whereRaw(`LOWER(TRIM(name)) IN ('clinical laboratory', 'laboratory')`)
		.update({ print_paper_size: 'half_letter' });
}

export async function down(_knex: Knex): Promise<void> {
	// No-op — data fix only.
}
