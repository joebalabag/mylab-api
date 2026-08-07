import type { Knex } from 'knex';

/**
 * Payment QR code that tenants scan to pay for the plan
 * (e.g. GCash / bank InstaPay QR uploaded by super admin).
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('subscription_plans', (table) => {
		table.string('qrcode_for_payment', 1000).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('subscription_plans', (table) => {
		table.dropColumn('qrcode_for_payment');
	});
}
