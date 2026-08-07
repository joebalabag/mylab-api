import type { Knex } from 'knex';

/**
 * Individual test rows inside a lab_report. One row per test_item pulled in
 * from the source patient_requisition_item. Test metadata (code / name /
 * result_type / unit / range / specimen) is snapshotted so later catalog
 * edits or renames don't rewrite historical reports. patient_requisition_item
 * is referenced RESTRICT so a paid requisition can't be deleted out from
 * under an issued lab report.
 *
 * A given patient_requisition_item can appear on many lab_report_items across
 * time (each void + re-issue creates a new row) but only ONE row with
 * is_active=true at a time — enforced by a partial unique index. is_active
 * is denormalized (not a subquery on lab_reports.status) because Postgres
 * disallows subqueries in index predicates; the void handler flips is_active
 * to false for all rows of the voided report to release the requisition item.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('lab_report_items', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table
			.string('lab_report_uuid')
			.notNullable()
			.references('uuid')
			.inTable('lab_reports')
			.onDelete('CASCADE');
		table
			.string('patient_requisition_item_uuid')
			.notNullable()
			.references('uuid')
			.inTable('patient_requisition_items')
			.onDelete('RESTRICT');

		// Only test_item-sourced requisition lines can become lab_report_items
		// (a package line is already exploded at requisition time into per-test
		// rows). test_item_uuid is nullable so a re-issue after a test_item
		// hard-delete still prints cleanly using the snapshot fields.
		table.string('test_item_uuid').nullable().references('uuid').inTable('test_items').onDelete('SET NULL');

		table.string('test_code', 100).notNullable();
		table.string('test_name', 500).notNullable();
		table.string('result_type', 30).notNullable();
		table.string('specimen', 255).nullable();
		table.string('unit_of_measure', 100).nullable();
		table.text('reference_range').nullable();

		// narrative / culture entries are stored on this row (culture reuses the
		// text field for the free-form organism/sensitivity write-up until the
		// dedicated culture table lands). single / panel entries live in
		// lab_result_values instead.
		table.text('narrative_text').nullable();

		table.integer('display_order').notNullable().defaultTo(0);

		// Kept in sync with the parent lab_report: true while draft/finalized,
		// false once voided. Powers the "one live coverage per requisition_item"
		// unique index below.
		table.boolean('is_active').notNullable().defaultTo(true);

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['tenant_uuid']);
		table.index(['lab_report_uuid', 'display_order']);
		table.index(['patient_requisition_item_uuid']);
	});

	await knex.raw(`
		ALTER TABLE lab_report_items
		ADD CONSTRAINT lab_report_items_result_type_check
		CHECK (result_type IN ('single','panel','narrative','culture'))
	`);

	// One live lab_report_item per requisition_item at a time. A voided report
	// releases the requisition_item so it can be re-issued into a fresh draft.
	await knex.raw(`
		CREATE UNIQUE INDEX lab_report_items_active_requisition_item_uniq
		ON lab_report_items (patient_requisition_item_uuid)
		WHERE is_active = true
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.raw('DROP INDEX IF EXISTS lab_report_items_active_requisition_item_uniq');
	await knex.schema.dropTable('lab_report_items');
}
