import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('users', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('username', 255).notNullable();
		table.string('passphrase', 500).notNullable();
		table.string('keycode', 500).notNullable();
		table.string('name', 500).notNullable();
		table.string('email', 255).nullable();
		table.string('role', 100).notNullable().defaultTo('cashier');
		table.timestamp('last_logindate').nullable();
		table.timestamp('last_change_password').nullable();
		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'username']);
		table.index(['tenant_uuid', 'status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('users');
}
