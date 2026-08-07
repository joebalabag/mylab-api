import type { Knex } from 'knex';

/**
 * Sub-analytes for panel-type test_items (e.g., CBC → WBC, RBC, Hgb, Hct...).
 * Meaningful only when the parent test_item.result_type = 'panel'; the API
 * enforces that gate on write. Rows cascade with the parent so components
 * die with the item.
 *
 * display_order drives the report renderer's row ordering. Ties fall back to
 * created_at asc so seeds import in the order written.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('test_item_components', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table
			.string('test_item_uuid')
			.notNullable()
			.references('uuid')
			.inTable('test_items')
			.onDelete('CASCADE');

		table.string('code', 100).notNullable();
		table.string('name', 500).notNullable();
		table.string('unit_of_measure', 50).nullable();
		table.string('reference_range', 500).nullable();
		table.integer('display_order').notNullable().defaultTo(0);

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['test_item_uuid', 'code']);
		table.index(['tenant_uuid']);
		table.index(['test_item_uuid', 'display_order']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('test_item_components');
}
