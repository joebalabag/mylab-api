import type { Knex } from 'knex';

/**
 * Per-tenant brand color for the frontend. Stores the primary hex (either a
 * preset's base hex or a custom one picked in Company Settings). Null = use
 * the shipped default red palette.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.string('theme_primary_color', 16).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('theme_primary_color');
	});
}
