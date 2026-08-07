import type { Knex } from 'knex';

/**
 * Immutable audit trail. One row per activated subscription. Snapshots the
 * plan fields at activation so plan renames/deletions don't rewrite history.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('tenant_subscription_history', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');

		table
			.string('subscription_plan_uuid')
			.nullable()
			.references('uuid')
			.inTable('subscription_plans')
			.onDelete('SET NULL');
		// Snapshots — survive plan deletes / renames
		table.string('subscription_plan_code', 100).notNullable();
		table.string('subscription_plan_name', 500).notNullable();

		table.timestamp('subscription_start').notNullable();
		table.timestamp('subscription_end').notNullable();
		table.integer('subscription_days').notNullable();
		table.integer('expiry_warning_days').notNullable();
		table.decimal('subscription_plan_amount', 14, 4).notNullable().defaultTo(0);

		// 'active' | 'expired' | 'cancelled' | 'scheduled'
		table.string('status', 50).notNullable().defaultTo('active');

		// Trace back to the payment that activated this row
		table.string('activated_by_payment_uuid').nullable();
		table.string('created_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'subscription_end']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('tenant_subscription_history');
}
