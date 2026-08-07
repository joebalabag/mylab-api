import type { Knex } from 'knex';

/**
 * Refine the lab-group default paper size: categories under item_groups
 * named "Clinical Laboratory" or "Laboratory" (case-insensitive) should be
 * `half_letter_crosswise` (8.5" × 5.5" landscape), not `half_letter`.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.raw(`
		UPDATE item_categories ic
		SET print_paper_size = 'half_letter_crosswise'
		FROM item_groups ig
		WHERE ic.item_group_uuid = ig.uuid
		  AND LOWER(TRIM(ig.name)) IN ('clinical laboratory', 'laboratory')
	`);
}

export async function down(knex: Knex): Promise<void> {
	// Roll back to the earlier half_letter default for those groups.
	await knex.raw(`
		UPDATE item_categories ic
		SET print_paper_size = 'half_letter'
		FROM item_groups ig
		WHERE ic.item_group_uuid = ig.uuid
		  AND LOWER(TRIM(ig.name)) IN ('clinical laboratory', 'laboratory')
	`);
}
