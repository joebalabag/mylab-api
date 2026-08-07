import type { Knex } from 'knex';

/**
 * Snapshot of exactly what the cashier settled — one row per requisition line
 * included in a payment. Snapshots let a receipt reprint be truthful even
 * after later catalog edits, discount changes, or partial voids.
 *
 * FK to patient_requisition_items uses SET NULL so a requisition item can be
 * hard-deleted for cleanup without wrecking historical receipts — the code +
 * name snapshot still prints. But typical flow: void the payment first,
 * which frees the item.
 *
 * (payment_uuid, patient_requisition_item_uuid) unique so the same line
 * can't be double-charged inside the same payment.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('payment_items', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('payment_uuid').notNullable().references('uuid').inTable('payments').onDelete('CASCADE');
		table.string('patient_requisition_uuid').notNullable().references('uuid').inTable('patient_requisitions').onDelete('RESTRICT');
		table
			.string('patient_requisition_item_uuid')
			.notNullable()
			.references('uuid')
			.inTable('patient_requisition_items')
			.onDelete('RESTRICT');

		// Snapshot for the receipt / audit trail.
		table.string('code', 100).notNullable();
		table.string('name', 500).notNullable();
		table.decimal('unit_price', 14, 2).notNullable().defaultTo(0);
		table.integer('quantity').notNullable().defaultTo(1);
		table.decimal('line_total', 14, 2).notNullable().defaultTo(0);
		// Discount + selling price as ACTUALLY PAID (may differ from the
		// requisition's quoted numbers if cashier changed the discount).
		table.decimal('line_discount_amount', 14, 2).notNullable().defaultTo(0);
		table.decimal('line_selling_price', 14, 2).notNullable().defaultTo(0);

		// Package attribution — inherited from the source requisition line so
		// the receipt can group tests under their bundle.
		table.string('package_uuid').nullable();
		table.string('package_code', 100).nullable();
		table.string('package_name', 500).nullable();

		table.integer('display_order').notNullable().defaultTo(0);

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['payment_uuid', 'patient_requisition_item_uuid']);
		table.index(['tenant_uuid']);
		table.index(['patient_requisition_uuid']);
		table.index(['patient_requisition_item_uuid']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('payment_items');
}
