import type { Knex } from 'knex';

/**
 * Audit trail column for super-admin overrides via
 * PATCH /tenant/alter-subscription/:uuid. Populated only on rows that were
 * created by an override (not by a payment approval), where it explains why.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenant_subscription_history', (table) => {
		table.text('alter_reason').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenant_subscription_history', (table) => {
		table.dropColumn('alter_reason');
	});
}
