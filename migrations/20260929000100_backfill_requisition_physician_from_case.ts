import type { Knex } from 'knex';

/**
 * Backfill patient_requisitions.physician from the parent case's
 * referring_physician for every existing requisition where the physician
 * field was left blank. Companion to the frontend change that auto-seeds
 * the requisition form's physician from the case on new-requisition open,
 * and to the lab-report SELECT fallback (COALESCE across pr.physician /
 * pc.referring_physician) that renders the case value on old reports at
 * read time.
 *
 * Scope: only rows where pr.physician is NULL or empty AND the parent
 * case has a non-empty referring_physician. Stamps updated_by with the
 * migration id so `down()` can revert exactly the rows we touched.
 */
const MIGRATION_ID = 'migration:20260929000100';

export async function up(knex: Knex): Promise<void> {
	await knex.raw(
		`
		UPDATE patient_requisitions pr
		SET physician  = pc.referring_physician,
		    updated_by = ?,
		    updated_at = NOW()
		FROM patient_cases pc
		WHERE pc.uuid = pr.patient_case_uuid
		  AND (pr.physician IS NULL OR pr.physician = '')
		  AND pc.referring_physician IS NOT NULL
		  AND pc.referring_physician <> ''
		`,
		[MIGRATION_ID],
	);
}

export async function down(knex: Knex): Promise<void> {
	// Revert only the rows this migration wrote. Uses updated_by as the
	// marker — anything a human touched since keeps its value.
	await knex.raw(
		`
		UPDATE patient_requisitions
		SET physician  = NULL,
		    updated_by = 'migration:20260929000100-revert',
		    updated_at = NOW()
		WHERE updated_by = ?
		`,
		[MIGRATION_ID],
	);
}
