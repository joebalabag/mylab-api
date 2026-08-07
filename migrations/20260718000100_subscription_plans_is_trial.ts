import type { Knex } from 'knex';

/**
 * Mark plans that should appear as pickable options on the public register page.
 * "Trial" here means "shown on signup" and is enforced to price = 0 (free).
 *
 * Backfill: any legacy row whose code is 'TRIAL' becomes is_trial=true so the
 * existing self-signup flow keeps working without admin intervention.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('subscription_plans', (table) => {
		table.boolean('is_trial').notNullable().defaultTo(false);
		table.index(['is_trial', 'status']);
	});

	await knex('subscription_plans').where({ code: 'TRIAL' }).update({ is_trial: true });
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('subscription_plans', (table) => {
		table.dropIndex(['is_trial', 'status']);
		table.dropColumn('is_trial');
	});
}
