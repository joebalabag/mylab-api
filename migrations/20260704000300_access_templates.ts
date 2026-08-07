import type { Knex } from 'knex';

/**
 * Global template of every permission node in the UI navigation. Seeded once;
 * per-user access lists reference these rows. has_access on the template row
 * is the default state (usually false).
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('access_templates', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.integer('navigation_id').notNullable();
		table.integer('catalog_id').notNullable();
		table.string('catalog', 100).notNullable();
		table.string('main_navigation', 200).notNullable();
		table.string('sub_navigation', 200).notNullable();
		table.boolean('has_access').notNullable().defaultTo(false);
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['catalog', 'main_navigation', 'sub_navigation']);
		table.unique(['navigation_id']);
		table.index(['catalog']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('access_templates');
}
