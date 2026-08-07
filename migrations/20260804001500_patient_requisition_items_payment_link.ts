import type { Knex } from 'knex';

/**
 * Ties each requisition line to the payment that settled it. NULL means the
 * line is still unpaid. Populated inside the create-payment transaction and
 * cleared on void so items become billable again.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisition_items', (table) => {
		table.string('payment_uuid').nullable().references('uuid').inTable('payments').onDelete('SET NULL');
		table.timestamp('paid_at', { useTz: true }).nullable();

		table.index(['patient_requisition_uuid', 'payment_uuid']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisition_items', (table) => {
		table.dropIndex(['patient_requisition_uuid', 'payment_uuid']);
		table.dropColumn('payment_uuid');
		table.dropColumn('paid_at');
	});
}
