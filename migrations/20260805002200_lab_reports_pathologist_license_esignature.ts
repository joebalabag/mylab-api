import type { Knex } from 'knex';

/**
 * Snapshot fields for the pathologist signatory populated at set-final time.
 * license + esignature are copied from the doctors table when the operator
 * picks a doctor (or the item group's default signatory kicks in), so
 * historical reports keep their original signature even if the doctor is
 * later edited or removed.
 */
export async function up(knex: Knex): Promise<void> {
	const hasLic = await knex.schema.hasColumn('lab_reports', 'pathologist_license');
	const hasEsig = await knex.schema.hasColumn('lab_reports', 'pathologist_esignature_image');
	await knex.schema.alterTable('lab_reports', (table) => {
		if (!hasLic)  table.string('pathologist_license', 100).nullable();
		if (!hasEsig) table.string('pathologist_esignature_image', 500).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_reports', (table) => {
		table.dropColumn('pathologist_license');
		table.dropColumn('pathologist_esignature_image');
	});
}
