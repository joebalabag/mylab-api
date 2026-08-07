import type { Knex } from 'knex';

/**
 * Bundle of test_items sold at a discounted total (e.g., Executive Check-up).
 * The `package_price` column is a cached sum of the child rows' `new_price`
 * (see 20260804000700_item_package_items). The service recomputes it whenever
 * items are synced.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('item_packages', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');

		table.string('code', 100).notNullable();
		table.string('name', 500).notNullable();
		table.text('description').nullable();

		// Cached total = SUM(items.new_price). Recomputed on every syncItems.
		table.decimal('package_price', 14, 2).notNullable().defaultTo(0);

		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'code']);
		table.index(['tenant_uuid', 'status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('item_packages');
}
