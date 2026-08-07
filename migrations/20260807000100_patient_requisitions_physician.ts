import type { Knex } from 'knex';

/**
 * Add a nullable `physician` column to patient_requisitions.
 *
 * The lab report header prints a Physician row that pulls from the
 * requisition (so a patient case with multiple requisitions can carry
 * different referring physicians per order). The case-level
 * `attending_physician` still exists — this is a per-requisition
 * override captured at intake.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisitions', (table) => {
		table.string('physician', 255).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisitions', (table) => {
		table.dropColumn('physician');
	});
}
