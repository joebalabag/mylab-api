import type { Knex } from 'knex';

/**
 * Drop the pathologist_esignature_image snapshot column from lab_reports.
 * The e-signature is now looked up live from doctors.esignature_image via
 * lab_reports.pathologist_uuid at read time, so there's a single source of
 * truth and edits to a doctor's signature reflect on their reports.
 */
export async function up(knex: Knex): Promise<void> {
	const has = await knex.schema.hasColumn('lab_reports', 'pathologist_esignature_image');
	if (has) {
		await knex.schema.alterTable('lab_reports', (table) => {
			table.dropColumn('pathologist_esignature_image');
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	const has = await knex.schema.hasColumn('lab_reports', 'pathologist_esignature_image');
	if (!has) {
		await knex.schema.alterTable('lab_reports', (table) => {
			table.string('pathologist_esignature_image', 500).nullable();
		});
	}
}
