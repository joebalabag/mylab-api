import type { Knex } from 'knex';

/**
 * Extend requisition status enum for the cashier workflow:
 *   draft → finalized → partially_paid → paid → (or cancelled at any point)
 *
 * Recomputed by the payment service after every payment create/void based on
 * how many of the requisition's items carry payment_uuid.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.raw(`ALTER TABLE patient_requisitions DROP CONSTRAINT patient_requisitions_status_check`);
	await knex.raw(`
		ALTER TABLE patient_requisitions
		ADD CONSTRAINT patient_requisitions_status_check
		CHECK (status IN ('draft','finalized','partially_paid','paid','cancelled'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	// Refuse rollback if any rows already use the new statuses — the strict
	// check would immediately reject them.
	await knex.raw(`ALTER TABLE patient_requisitions DROP CONSTRAINT patient_requisitions_status_check`);
	await knex.raw(`
		ALTER TABLE patient_requisitions
		ADD CONSTRAINT patient_requisitions_status_check
		CHECK (status IN ('draft','finalized','cancelled'))
	`);
}
