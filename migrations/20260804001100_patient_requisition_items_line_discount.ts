import type { Knex } from 'knex';

/**
 * Per-line discount attribution. The requisition-level discount_amount is
 * split across the items proportionally by each line's line_total:
 *
 *   line_discount_amount = round(line_total / subtotal × requisition.discount_amount, 2)
 *   line_selling_price   = line_total - line_discount_amount
 *
 * The last line absorbs rounding remainder so per-line discounts sum
 * exactly to requisition.discount_amount (no ₱0.01 drift). These fields are
 * recomputed by the service on every syncItems and setDiscount call.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisition_items', (table) => {
		table.decimal('line_discount_amount', 14, 2).notNullable().defaultTo(0);
		table.decimal('line_selling_price', 14, 2).notNullable().defaultTo(0);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisition_items', (table) => {
		table.dropColumn('line_discount_amount');
		table.dropColumn('line_selling_price');
	});
}
