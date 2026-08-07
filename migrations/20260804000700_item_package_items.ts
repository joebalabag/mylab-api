import type { Knex } from 'knex';

/**
 * Line items inside an item_package.
 *
 *   current_price — snapshot of test_items.price at the moment the item is
 *                   added to the package. Preserves quoted pricing even if the
 *                   underlying test's price later changes. Editable.
 *   new_price     — the discounted price this item carries WITHIN this package.
 *                   Sum of new_price across rows == parent.package_price.
 *
 * FK to test_items uses RESTRICT so a bundled test can't disappear from under
 * the package. Cascade on parent so deleting a package cleans its rows.
 * (tenant_uuid, item_package_uuid, test_item_uuid) is unique — same test can't
 * appear twice in a package.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('item_package_items', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table
			.string('item_package_uuid')
			.notNullable()
			.references('uuid')
			.inTable('item_packages')
			.onDelete('CASCADE');
		table
			.string('test_item_uuid')
			.notNullable()
			.references('uuid')
			.inTable('test_items')
			.onDelete('RESTRICT');

		table.decimal('current_price', 14, 2).notNullable().defaultTo(0);
		table.decimal('new_price', 14, 2).notNullable().defaultTo(0);
		table.integer('display_order').notNullable().defaultTo(0);

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['item_package_uuid', 'test_item_uuid']);
		table.index(['tenant_uuid']);
		table.index(['item_package_uuid', 'display_order']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('item_package_items');
}
