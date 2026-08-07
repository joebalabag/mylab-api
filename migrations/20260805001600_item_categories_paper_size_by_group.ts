import type { Knex } from 'knex';

/**
 * Correct the paper-size rule: match on the parent ITEM_GROUP name, not on
 * the item_category name.
 *
 *   Every item_category → `letter` (regular short bond 8.5" × 11").
 *   Categories whose parent item_group.name is "Clinical Laboratory" or
 *   "Laboratory" (case-insensitive, whitespace-tolerant) → `half_letter`
 *   (5.5" × 8.5").
 */
export async function up(knex: Knex): Promise<void> {
	// Baseline: every category on short bond.
	await knex('item_categories').update({ print_paper_size: 'letter' });

	// Promote categories under the two named item_groups to half short bond.
	// UPDATE ... FROM pattern (Postgres) — join on the group's uuid.
	await knex.raw(`
		UPDATE item_categories ic
		SET print_paper_size = 'half_letter'
		FROM item_groups ig
		WHERE ic.item_group_uuid = ig.uuid
		  AND LOWER(TRIM(ig.name)) IN ('clinical laboratory', 'laboratory')
	`);
}

export async function down(_knex: Knex): Promise<void> {
	// No-op — data fix only.
}
