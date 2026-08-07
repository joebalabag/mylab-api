import type { Knex } from 'knex';

/**
 * A test-order attached to a patient_case. One case may have many requisitions
 * (later visits or add-on tests). subtotal + total are cached from the child
 * rows (see 20260804001000_patient_requisition_items) — the syncItems service
 * recomputes both on every write.
 *
 * requisition_number: server-generated per tenant, format "R-NNNNNN".
 *
 * status: draft (add/edit items) → finalized (order sent to lab / billing) →
 * cancelled. Payment lands in a future module and will reference this row.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('patient_requisitions', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('patient_case_uuid').notNullable().references('uuid').inTable('patient_cases').onDelete('CASCADE');
		// Denormalized so we can list requisitions per patient without joining
		// through cases every time.
		table.string('patient_uuid').notNullable().references('uuid').inTable('patients').onDelete('RESTRICT');

		table.string('requisition_number', 50).notNullable();
		table.timestamp('requisition_date', { useTz: true }).notNullable().defaultTo(knex.raw('now()'));
		table.text('notes').nullable();

		// Cached line-item aggregates. subtotal = SUM(line_total).
		// total = subtotal - discount_amount. Both recomputed together on
		// syncItems and setDiscount.
		table.decimal('subtotal', 14, 2).notNullable().defaultTo(0);
		table.decimal('total', 14, 2).notNullable().defaultTo(0);

		// Requisition-level discount. All fields snapshot at set time so the
		// bill stays accurate if the discount is later edited or deleted from
		// the catalog. discount_amount is the peso value applied to subtotal
		// (percent → subtotal × value / 100, fix → min(subtotal, value),
		// open_amount → operator enters the amount directly, capped at subtotal).
		table.string('discount_uuid').nullable().references('uuid').inTable('discounts').onDelete('SET NULL');
		table.string('discount_code', 100).nullable();
		table.string('discount_name', 500).nullable();
		table.string('discount_type', 50).nullable();          // percent | fix | open_amount
		table.decimal('discount_value', 14, 4).nullable();     // snapshot of discounts.value
		table.decimal('discount_amount', 14, 2).notNullable().defaultTo(0);

		table.string('status', 50).notNullable().defaultTo('draft');

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'requisition_number']);
		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'patient_case_uuid']);
		table.index(['tenant_uuid', 'patient_uuid']);
		table.index(['tenant_uuid', 'requisition_date']);
	});

	await knex.raw(`
		ALTER TABLE patient_requisitions
		ADD CONSTRAINT patient_requisitions_status_check
		CHECK (status IN ('draft','finalized','cancelled'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('patient_requisitions');
}
