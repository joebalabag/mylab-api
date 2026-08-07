import type { Knex } from 'knex';

/**
 * Patient Case Registry — hospital-inspired but scoped to OPD for now. A case
 * is an episode of care against a patient (registration/admission through
 * discharge). Test orders (requisitions) attach to a case; the case is the
 * transactional root for one visit.
 *
 * case_number is generated server-side per (tenant, case_type) with format
 * "<TYPE>-NNNNNN" (OPD-000001, later IPD-000001 without renumbering).
 * A per-(tenant,type) advisory lock inside the create transaction serializes
 * concurrent registrations so no two cases ever share a number.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('patient_cases', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('patient_uuid').notNullable().references('uuid').inTable('patients').onDelete('RESTRICT');

		table.string('case_number', 50).notNullable();
		// OPD | IPD | ER — enforced at DTO + CHECK. Default OPD since that's
		// the only surface we implement today.
		table.string('case_type', 20).notNullable().defaultTo('OPD');

		table.timestamp('admission_date', { useTz: true }).notNullable().defaultTo(knex.raw('now()'));
		table.timestamp('discharge_date', { useTz: true }).nullable();

		table.text('chief_complaint').nullable();
		table.string('attending_physician', 255).nullable();
		table.string('referring_physician', 255).nullable();
		table.text('notes').nullable();

		// open (default) → closed → cancelled. Kept as a text status so future
		// workflow states can be added without a migration.
		table.string('status', 50).notNullable().defaultTo('open');

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'case_number']);
		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'case_type']);
		table.index(['tenant_uuid', 'patient_uuid']);
		table.index(['tenant_uuid', 'admission_date']);
	});

	await knex.raw(`
		ALTER TABLE patient_cases
		ADD CONSTRAINT patient_cases_case_type_check
		CHECK (case_type IN ('OPD','IPD','ER'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('patient_cases');
}
