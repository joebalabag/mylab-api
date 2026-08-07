import type { Knex } from 'knex';

/**
 * Cashier payments. One row per settlement; a settlement can cover any subset
 * of unpaid finalized requisition items on a single case (see payment_items).
 *
 *   payment_number: auto per-tenant "PAY-NNNNNN" (advisory-locked in the service)
 *   discount_*:     snapshotted from the discounts catalog at payment time so
 *                   later catalog edits can't rewrite a receipt
 *   subtotal / total: cached aggregates; recomputed by the service
 *   payment_method: cash | card | gcash | bank_transfer | insurance | other
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('payments', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('patient_case_uuid').notNullable().references('uuid').inTable('patient_cases').onDelete('RESTRICT');
		table.string('patient_uuid').notNullable().references('uuid').inTable('patients').onDelete('RESTRICT');

		table.string('payment_number', 50).notNullable();
		table.timestamp('payment_date', { useTz: true }).notNullable().defaultTo(knex.raw('now()'));

		table.decimal('subtotal', 14, 2).notNullable().defaultTo(0);
		table.decimal('total', 14, 2).notNullable().defaultTo(0);

		table.string('discount_uuid').nullable().references('uuid').inTable('discounts').onDelete('SET NULL');
		table.string('discount_code', 100).nullable();
		table.string('discount_name', 500).nullable();
		table.string('discount_type', 50).nullable();
		table.decimal('discount_value', 14, 4).nullable();
		table.decimal('discount_amount', 14, 2).notNullable().defaultTo(0);

		table.string('payment_method', 50).notNullable().defaultTo('cash');
		table.decimal('amount_tendered', 14, 2).nullable();
		table.decimal('change_amount', 14, 2).nullable();

		table.text('notes').nullable();
		// completed → voided (a void keeps the row but unpaws the items back to unpaid)
		table.string('status', 50).notNullable().defaultTo('completed');

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'payment_number']);
		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'patient_case_uuid']);
		table.index(['tenant_uuid', 'patient_uuid']);
		table.index(['tenant_uuid', 'payment_date']);
	});

	await knex.raw(`
		ALTER TABLE payments
		ADD CONSTRAINT payments_status_check
		CHECK (status IN ('completed','voided'))
	`);
	await knex.raw(`
		ALTER TABLE payments
		ADD CONSTRAINT payments_method_check
		CHECK (payment_method IN ('cash','card','gcash','bank_transfer','insurance','other'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('payments');
}
