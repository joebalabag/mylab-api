import type { Knex } from 'knex';

/**
 * Append-only audit log of subscription-plan price changes. A row is inserted
 * on plan create (old_price NULL) and on every update where price actually
 * moves. Non-price edits (name, features, modules) are intentionally not
 * logged — the intent is to answer "when did this plan cost change and who
 * did it" from the super-admin Plans view.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('subscription_plan_price_logs', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table
			.string('subscription_plan_uuid')
			.notNullable()
			.references('uuid')
			.inTable('subscription_plans')
			.onDelete('CASCADE');

		table.decimal('old_price', 14, 4).nullable();
		table.decimal('new_price', 14, 4).notNullable();

		table.string('source', 50).notNullable().defaultTo('edit');
		table.string('changed_by', 255).nullable();
		table.timestamp('changed_at').notNullable().defaultTo(knex.fn.now());

		table.index(['subscription_plan_uuid', 'changed_at']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('subscription_plan_price_logs');
}
