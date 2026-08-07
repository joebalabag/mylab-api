import type { Knex } from 'knex';

/**
 * Subscription plans offered by the platform (super admin manages).
 * Global — not tenant-scoped. Tenants subscribe to a plan.
 *
 *   status='active'   → plan is offered to new subscribers
 *   status='inactive' → plan is hidden from sign-up; existing subscriptions still valid
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('subscription_plans', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('code', 100).notNullable().unique();
		table.string('name', 500).notNullable();
		table.decimal('price', 14, 4).notNullable().defaultTo(0);
		table.integer('days_duration').notNullable();
		table.text('features').nullable();
		table.integer('days_warning_for_near_expiry').notNullable().defaultTo(7);
		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('subscription_plans');
}
