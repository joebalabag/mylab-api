import type { Knex } from 'knex';

/**
 * Package attribution on requisition lines. When the operator adds a package
 * to a requisition, the frontend explodes it into one row per contained
 * test_item (source_type='test_item') so every line maps to exactly one
 * test that will need a lab result later. These columns preserve which
 * package the tests came from so the UI can group them and reports can show
 * the bundle origin.
 *
 * NULL = standalone test (added directly, not via a package).
 * Snapshots keep the label stable if the source package is later renamed.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisition_items', (table) => {
		table.string('package_uuid').nullable().references('uuid').inTable('item_packages').onDelete('SET NULL');
		table.string('package_code', 100).nullable();
		table.string('package_name', 500).nullable();

		table.index(['patient_requisition_uuid', 'package_uuid']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisition_items', (table) => {
		table.dropIndex(['patient_requisition_uuid', 'package_uuid']);
		table.dropColumn('package_uuid');
		table.dropColumn('package_code');
		table.dropColumn('package_name');
	});
}
