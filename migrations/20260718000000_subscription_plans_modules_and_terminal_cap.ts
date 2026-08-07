import type { Knex } from 'knex';

/**
 * Add plan-level POS module allow-list and terminal cap to subscription_plans.
 *
 *   allowed_modules  JSONB  — subset of ['order_pos','terminal_pos','kds'].
 *                             'kds' bundles the KDS POS view + Kitchen Display.
 *                             Non-POS modules (Products, Reports, Users, etc.)
 *                             stay universally available regardless of plan.
 *   max_terminals    INT    — nullable; null means "unlimited".
 *
 * Backfill existing plans to all-modules + unlimited so nobody loses access on
 * upgrade. Super admins tighten per-plan afterward via the SuperPlansView UI.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('subscription_plans', (table) => {
		table.jsonb('allowed_modules').notNullable().defaultTo(knex.raw(`'[]'::jsonb`));
		table.integer('max_terminals').nullable();
	});

	await knex('subscription_plans').update({
		allowed_modules: JSON.stringify(['order_pos', 'terminal_pos', 'kds']),
		max_terminals: null,
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('subscription_plans', (table) => {
		table.dropColumn('allowed_modules');
		table.dropColumn('max_terminals');
	});
}
