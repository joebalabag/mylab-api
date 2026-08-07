import type { Knex } from 'knex';

/**
 * Add PayPal-side identifiers to tenant_subscription_payments so the capture
 * endpoint and the webhook can de-dupe against each other (the two paths race
 * each other after a successful checkout).
 *
 *   paypal_order_id    — Orders v2 order id, unique when set
 *   paypal_capture_id  — Orders v2 capture id, unique when set
 *
 * Both nullable so existing manual proof-of-payment rows remain valid.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenant_subscription_payments', (table) => {
		table.string('paypal_order_id', 64).nullable();
		table.string('paypal_capture_id', 64).nullable();
	});
	// Partial unique indexes — only enforce uniqueness on non-null values so
	// legacy rows (all NULL) don't collide.
	await knex.raw(
		'CREATE UNIQUE INDEX tenant_subscription_payments_paypal_order_id_uniq ' +
		'ON tenant_subscription_payments (paypal_order_id) WHERE paypal_order_id IS NOT NULL',
	);
	await knex.raw(
		'CREATE UNIQUE INDEX tenant_subscription_payments_paypal_capture_id_uniq ' +
		'ON tenant_subscription_payments (paypal_capture_id) WHERE paypal_capture_id IS NOT NULL',
	);
}

export async function down(knex: Knex): Promise<void> {
	await knex.raw('DROP INDEX IF EXISTS tenant_subscription_payments_paypal_capture_id_uniq');
	await knex.raw('DROP INDEX IF EXISTS tenant_subscription_payments_paypal_order_id_uniq');
	await knex.schema.alterTable('tenant_subscription_payments', (table) => {
		table.dropColumn('paypal_capture_id');
		table.dropColumn('paypal_order_id');
	});
}
