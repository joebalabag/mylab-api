import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('discounts', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');

		table.string('code', 100).notNullable();
		table.string('name', 500).notNullable();
		// 'percent' | 'fix' | 'open_amount'
		table.string('discount_type', 50).notNullable();
		table.decimal('value', 14, 4).notNullable().defaultTo(0);

		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'code']);
		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'discount_type']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('discounts');
}
