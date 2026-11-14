import type { Knex } from 'knex';

/**
 * Admins can void an approved subscription payment. Mirrors the shape of the
 * reject fields — `payment_status` becomes 'voided' (string column, no DB
 * enum constraint) and the four new columns record who/when/why.
 *
 * Scope: this is a book-keeping void only. The tenant's current_subscription_*
 * fields are left untouched; admins use the "Adjust current expiry" override
 * on a new payment if they want to roll the subscription back.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenant_subscription_payments', (table) => {
		table
			.string('payment_voided_by_uuid')
			.nullable()
			.references('uuid')
			.inTable('admins')
			.onDelete('SET NULL');
		table.string('payment_voided_by_name', 255).nullable();
		table.timestamp('payment_voided_datetime').nullable();
		table.text('void_reason').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenant_subscription_payments', (table) => {
		table.dropColumn('payment_voided_by_uuid');
		table.dropColumn('payment_voided_by_name');
		table.dropColumn('payment_voided_datetime');
		table.dropColumn('void_reason');
	});
}
