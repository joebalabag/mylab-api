import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('user_password_history', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('user_uuid').notNullable().references('uuid').inTable('users').onDelete('CASCADE');
		table.string('passphrase', 500).notNullable();
		table.string('keycode', 500).notNullable();
		table.string('changed_by', 255).nullable();
		table.string('change_source', 50).nullable(); // 'dashboard' or 'profile'
		table.timestamp('created_at').defaultTo(knex.fn.now());

		table.index(['tenant_uuid', 'user_uuid']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('user_password_history');
}
