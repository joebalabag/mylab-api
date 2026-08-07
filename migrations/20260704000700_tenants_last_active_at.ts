import type { Knex } from 'knex';

/**
 * Timestamp of the most recent activity from any user of this tenant.
 * Currently updated on every successful user login.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.timestamp('last_active_at').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('last_active_at');
	});
}
