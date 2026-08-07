import type { Knex } from 'knex';

/**
 * Superseded by pending_tenant_registrations — we no longer create pending
 * tenant / user rows during self-registration. Everything sits in the pending
 * table until verification actually promotes it.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.dropTableIfExists('tenant_verification_tokens');
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.createTable('tenant_verification_tokens', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('user_uuid').notNullable().references('uuid').inTable('users').onDelete('CASCADE');
		table.string('token', 128).notNullable().unique();
		table.string('email', 255).notNullable();
		table.timestamp('expires_at').notNullable();
		table.timestamp('consumed_at').nullable();
		table.timestamps(true, true);
	});
}
