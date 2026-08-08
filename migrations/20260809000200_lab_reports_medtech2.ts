import type { Knex } from 'knex';

/**
 * Second tester signatory snapshot on lab_reports — used only when the
 * tenant is configured for `tester_signatory_count = 2`.
 *
 *   medtech2_uuid    → users.uuid of the second signer (may be null when
 *                      the second-signer credential prompt resolved to
 *                      the same user as slot 1 — that case collapses to
 *                      a single printed signature).
 *   medtech2_name    → snapshotted from users.lab_display_name (falls
 *                      back to users.name) at finalize time.
 *   medtech2_license → snapshotted from users.license_number.
 *
 * Slot 1 (`medtech_*`) semantics for count = 2 stay as-is (stamped from
 * the creator at createBatch). For count = 1, slot 1 becomes the
 * finalizer stamp (createBatch leaves it null and setFinal fills it).
 * medtech2_* stays null when tester_signatory_count = 1.
 */
export async function up(knex: Knex): Promise<void> {
	const hasUuid    = await knex.schema.hasColumn('lab_reports', 'medtech2_uuid');
	const hasName    = await knex.schema.hasColumn('lab_reports', 'medtech2_name');
	const hasLicense = await knex.schema.hasColumn('lab_reports', 'medtech2_license');
	await knex.schema.alterTable('lab_reports', (table) => {
		if (!hasUuid)    table.uuid('medtech2_uuid').nullable();
		if (!hasName)    table.string('medtech2_name', 255).nullable();
		if (!hasLicense) table.string('medtech2_license', 100).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_reports', (table) => {
		table.dropColumn('medtech2_uuid');
		table.dropColumn('medtech2_name');
		table.dropColumn('medtech2_license');
	});
}
