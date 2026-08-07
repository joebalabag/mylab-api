import type { Knex } from 'knex';

/**
 * Store the trial subscription plan chosen at register time so verify() can
 * activate the same plan the user picked, even if the admin adds/removes trial
 * plans between register and verify.
 *
 * Nullable because pending rows created before this feature don't carry a
 * choice — the verify() flow falls back to any active is_trial plan for those.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table
			.string('subscription_plan_uuid')
			.nullable()
			.references('uuid')
			.inTable('subscription_plans')
			.onDelete('SET NULL');
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.dropColumn('subscription_plan_uuid');
	});
}
