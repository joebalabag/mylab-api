import type { Knex } from 'knex';

/**
 * Two new user-facing fields for lab-report signatories:
 *   license_number    — PRC / professional license printed under the name
 *   lab_display_name  — override for what appears on the lab report as the
 *                       medtech (e.g. include title / "RMT"). Falls back to
 *                       `name` when NULL.
 */
export async function up(knex: Knex): Promise<void> {
	const hasLic = await knex.schema.hasColumn('users', 'license_number');
	const hasDisp = await knex.schema.hasColumn('users', 'lab_display_name');
	await knex.schema.alterTable('users', (table) => {
		if (!hasLic)  table.string('license_number', 100).nullable();
		if (!hasDisp) table.string('lab_display_name', 255).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('users', (table) => {
		table.dropColumn('lab_display_name');
		table.dropColumn('license_number');
	});
}
