import type { Knex } from 'knex';

/**
 * Structured result rows for 'single' and 'panel' lab_report_items.
 *
 *   single → exactly one row; test_item_component_uuid is NULL and the
 *            component_* fields snapshot from the parent test_item.
 *   panel  → one row per test_item_component (seeded from
 *            test_item_components at create time). component_* fields
 *            snapshot the component metadata.
 *
 * narrative and culture write to lab_report_items.narrative_text and do not
 * insert rows here. value_numeric is kept alongside value_text to support
 * downstream numeric charting / reference-range checks without re-parsing.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('lab_result_values', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table
			.string('lab_report_item_uuid')
			.notNullable()
			.references('uuid')
			.inTable('lab_report_items')
			.onDelete('CASCADE');
		table
			.string('test_item_component_uuid')
			.nullable()
			.references('uuid')
			.inTable('test_item_components')
			.onDelete('SET NULL');

		table.string('component_code', 100).notNullable();
		table.string('component_name', 500).notNullable();
		table.string('unit_of_measure', 100).nullable();
		table.text('reference_range').nullable();

		table.text('value_text').nullable();
		table.decimal('value_numeric', 18, 6).nullable();
		table.string('flag', 20).nullable();     // normal | low | high | abnormal | critical

		table.integer('display_order').notNullable().defaultTo(0);

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['tenant_uuid']);
		table.index(['lab_report_item_uuid', 'display_order']);
	});

	await knex.raw(`
		ALTER TABLE lab_result_values
		ADD CONSTRAINT lab_result_values_flag_check
		CHECK (flag IS NULL OR flag IN ('normal','low','high','abnormal','critical'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('lab_result_values');
}
