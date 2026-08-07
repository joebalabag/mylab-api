import type { Knex } from 'knex';

/**
 * Holds a self-registration submission until the owner clicks the email
 * verification link. On verify the tenant + admin user + trial subscription
 * are created and the pending row is deleted. Password is stored hashed so
 * we never persist plaintext.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('pending_tenant_registrations', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('token', 128).notNullable().unique();
		table.timestamp('expires_at').notNullable();

		// Tenant snapshot
		table.string('display_name', 500).notNullable();
		table.string('store_code', 100).notNullable();
		table.string('legal_name', 500).nullable();
		table.string('currency', 10).notNullable().defaultTo('PHP');
		table.string('email_address', 255).notNullable();
		table.string('contact_number', 50).nullable();

		// Admin user snapshot (password already hashed)
		table.string('username', 100).notNullable();
		table.string('name', 500).notNullable();
		table.string('passphrase', 500).notNullable();
		table.string('keycode', 500).notNullable();

		table.timestamps(true, true);

		table.index(['email_address']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('pending_tenant_registrations');
}
