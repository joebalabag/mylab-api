import type { Knex } from 'knex';

/**
 * Per-tenant Result Header configuration for the printed lab report.
 *
 *   lab_header_mode      = 'image' → use lab_header_image only (full-width banner)
 *                        = 'logo_text' → use tenant company_logo on the left +
 *                          lab_header_text on the right (multi-line).
 *                        NULL / other → falls back to logo_text.
 *   lab_header_image     = /public/uploads/tenants/lab-header/<file>
 *   lab_header_text      = multi-line free-form (clinic name, address, contact).
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.string('lab_header_mode', 20).nullable();
		table.string('lab_header_image').nullable();
		table.text('lab_header_text').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('lab_header_mode');
		table.dropColumn('lab_header_image');
		table.dropColumn('lab_header_text');
	});
}
