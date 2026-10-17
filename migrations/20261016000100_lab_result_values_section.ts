import type { Knex } from 'knex';

/**
 * Mirror of test_item_components.section onto the snapshot table so panel
 * value groupings survive a catalog edit. Historical labs backfill to NULL
 * (same visual as before: a single ungrouped block); new labs seeded from
 * a sectioned panel will carry the sub-heading forward.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_result_values', (table) => {
		table.string('section', 100).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_result_values', (table) => {
		table.dropColumn('section');
	});
}
