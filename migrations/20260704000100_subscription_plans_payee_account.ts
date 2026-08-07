import type { Knex } from 'knex';

/**
 * Payee account details tenants send money to when paying for this plan.
 * account_type is free-form (e.g. "BDO", "GCash", "BPI") so ops can add new
 * providers without a migration.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('subscription_plans', (table) => {
		table.string('account_number', 255).nullable();
		table.string('account_name', 500).nullable();
		table.string('account_type', 100).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('subscription_plans', (table) => {
		table.dropColumn('account_number');
		table.dropColumn('account_name');
		table.dropColumn('account_type');
	});
}
