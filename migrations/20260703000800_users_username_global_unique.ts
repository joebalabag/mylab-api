import type { Knex } from 'knex';

/**
 * Switch users.username from per-tenant unique to globally unique so that
 * user login only needs { username, password } — the tenant is derived
 * from the matched user row.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('users', (table) => {
		table.dropUnique(['tenant_uuid', 'username']);
		table.unique(['username']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('users', (table) => {
		table.dropUnique(['username']);
		table.unique(['tenant_uuid', 'username']);
	});
}
