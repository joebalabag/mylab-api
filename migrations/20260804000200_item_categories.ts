import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('item_categories', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table
			.string('item_group_uuid')
			.notNullable()
			.references('uuid')
			.inTable('item_groups')
			.onDelete('RESTRICT');

		table.string('code', 100).notNullable();
		table.string('name', 500).notNullable();
		table.text('description').nullable();

		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'code']);
		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'item_group_uuid']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('item_categories');
}
