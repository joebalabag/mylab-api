import type { Knex } from 'knex';

/**
 * A finalizable set of test results. One requisition may spawn several
 * lab_reports depending on how the operator grouped its paid items in the
 * Add Laboratory modal (default: one report per item_category with
 * combine_printout=true, plus one report per test_item for categories with
 * combine_printout=false — overridable).
 *
 * Lifecycle:
 *   draft (medtech encodes results)
 *     → finalized (pathologist tags final; finalized_at + pathologist_* set;
 *                  results become read-only. To correct, void + re-issue.)
 *     → voided   (soft-void with void_reason; row stays for audit. The same
 *                 requisition_items can be re-issued as a fresh draft report.)
 *
 * medtech_name is snapshotted from the user who created the row; pathologist
 * fields are only populated at set-final time (kept nullable while draft).
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('lab_reports', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table
			.string('patient_requisition_uuid')
			.notNullable()
			.references('uuid')
			.inTable('patient_requisitions')
			.onDelete('RESTRICT');
		table.string('patient_uuid').notNullable().references('uuid').inTable('patients').onDelete('RESTRICT');
		table.string('patient_case_uuid').notNullable().references('uuid').inTable('patient_cases').onDelete('RESTRICT');

		// Category snapshot. NULL when the report is a single-test group under
		// a combine_printout=false category (still stored for reference on the
		// print-out header). Snapshot names insulate the print-out from later
		// catalog renames.
		table.string('item_category_uuid').nullable().references('uuid').inTable('item_categories').onDelete('SET NULL');
		table.string('item_category_code', 100).nullable();
		table.string('item_category_name', 500).nullable();

		table.string('lab_number', 50).notNullable();

		table.string('status', 30).notNullable().defaultTo('draft');
		table.text('void_reason').nullable();

		// Result-authoring role snapshots. medtech_* set on create; pathologist_*
		// set on set-final. user_uuid columns are nullable so records survive
		// even if the user row is later deleted / disabled.
		table.string('medtech_uuid').nullable();
		table.string('medtech_name', 255).nullable();
		table.string('pathologist_uuid').nullable();
		table.string('pathologist_name', 255).nullable();
		table.timestamp('finalized_at', { useTz: true }).nullable();
		table.timestamp('voided_at', { useTz: true }).nullable();

		table.text('remarks').nullable();

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'lab_number']);
		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'patient_requisition_uuid']);
		table.index(['tenant_uuid', 'patient_uuid']);
		table.index(['tenant_uuid', 'created_at']);
	});

	await knex.raw(`
		ALTER TABLE lab_reports
		ADD CONSTRAINT lab_reports_status_check
		CHECK (status IN ('draft','finalized','voided'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('lab_reports');
}
