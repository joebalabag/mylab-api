import type { Knex } from 'knex';

/**
 * Cache the tenant's active subscription on the tenants row so the POS can
 * check "am I still subscribed?" without a join. Sourced from the latest
 * approved tenant_subscription_payments row.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table
			.string('current_subscription_plan_uuid')
			.nullable()
			.references('uuid')
			.inTable('subscription_plans')
			.onDelete('SET NULL');
		table.integer('current_subscription_days').nullable();
		table.timestamp('current_subscription_start').nullable();
		table.timestamp('current_subscription_expiry').nullable();
		table.integer('current_subscription_expiry_warning_days').nullable();
		table.decimal('current_subscription_plan_amount', 14, 4).notNullable().defaultTo(0);

		table.index(['current_subscription_expiry']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropIndex(['current_subscription_expiry']);
		table.dropColumn('current_subscription_plan_uuid');
		table.dropColumn('current_subscription_days');
		table.dropColumn('current_subscription_start');
		table.dropColumn('current_subscription_expiry');
		table.dropColumn('current_subscription_expiry_warning_days');
		table.dropColumn('current_subscription_plan_amount');
	});
}
