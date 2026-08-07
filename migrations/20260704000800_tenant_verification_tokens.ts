import type { Knex } from 'knex';

/**
 * Verification tokens issued during public tenant self-registration. Each row
 * holds the one-time token sent to the admin email; it is consumed on
 * successful verification (activates the tenant + admin user).
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('tenant_verification_tokens', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('user_uuid').notNullable().references('uuid').inTable('users').onDelete('CASCADE');
		table.string('token', 128).notNullable().unique();
		table.string('email', 255).notNullable();
		table.timestamp('expires_at').notNullable();
		table.timestamp('consumed_at').nullable();
		table.timestamps(true, true);

		table.index(['tenant_uuid']);
		table.index(['user_uuid']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('tenant_verification_tokens');
}
