import type { Knex } from 'knex';

/**
 * The healthcare professional role that RUNS the tests in this item group
 * (e.g. "Medical Technologist" for lab, "Radiologic Technologist" for X-ray,
 * "Sonographer" for ultrasound). Printed under the medtech signature block
 * on the finalized report so a radiology report doesn't hard-code
 * "Medical Technologist" the way it used to.
 */
export async function up(knex: Knex): Promise<void> {
	const has = await knex.schema.hasColumn('item_groups', 'tester_role');
	if (!has) {
		await knex.schema.alterTable('item_groups', (table) => {
			table.string('tester_role', 100).nullable();
		});
	}
	// Seed the default so existing "Laboratory" groups get a sensible label
	// without waiting for the operator to re-save the row.
	await knex.raw(`
		UPDATE item_groups
		SET tester_role = 'Medical Technologist'
		WHERE tester_role IS NULL
		  AND LOWER(TRIM(name)) IN ('clinical laboratory', 'laboratory')
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('item_groups', (table) => {
		table.dropColumn('tester_role');
	});
}
