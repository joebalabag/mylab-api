import type { Knex } from 'knex';

/**
 * Amount the tenant actually paid — can differ from the plan's price
 * (over/underpayment, promo codes, etc). Admin can compare against
 * subscription_plan_amount at approval time.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenant_subscription_payments', (table) => {
		table.decimal('amount_paid', 14, 4).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenant_subscription_payments', (table) => {
		table.dropColumn('amount_paid');
	});
}
