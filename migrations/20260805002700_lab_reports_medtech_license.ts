import type { Knex } from 'knex';

/**
 * Snapshot slot for the medtech's license number on the lab_report so
 * historical prints retain it even if the user record is later edited.
 * The name snapshot (medtech_name) already exists; we now also pull the
 * user's lab_display_name (if set) into it at createBatch time.
 */
export async function up(knex: Knex): Promise<void> {
	const has = await knex.schema.hasColumn('lab_reports', 'medtech_license');
	if (!has) {
		await knex.schema.alterTable('lab_reports', (table) => {
			table.string('medtech_license', 100).nullable();
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_reports', (table) => {
		table.dropColumn('medtech_license');
	});
}
