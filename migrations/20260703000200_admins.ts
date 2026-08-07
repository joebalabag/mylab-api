import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('admins', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('username', 255).notNullable().unique();
		table.string('passphrase', 500).notNullable();
		table.string('keycode', 500).notNullable();
		table.string('name', 500).notNullable();
		table.string('email', 255).nullable();
		table.string('role', 100).notNullable().defaultTo('super_admin');
		table.timestamp('last_logindate').nullable();
		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamp('change_password_datetime').nullable();
		table.string('change_password_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('admins');
}
