import type { Knex } from 'knex';

/**
 * Adds the tenant's IANA timezone. Used by the discount scheduling engine to
 * decide when day-of-week / time-of-day windows apply — always evaluated in
 * the tenant's local wall clock, never the server's. Default 'Asia/Manila'
 * matches the current single-region deployment; existing rows backfill to it.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.string('timezone', 64).notNullable().defaultTo('Asia/Manila');
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('timezone');
	});
}
