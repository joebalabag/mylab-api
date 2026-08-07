import type { Knex } from 'knex';

/**
 * Per-user permission matrix. One row per (user, navigation node) — mirrors
 * access_templates structure, plus tenant/user scoping. The template row is
 * kept as a soft link (access_template_uuid) for lineage; if the template row
 * disappears the user's override survives.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('user_accesses', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('user_uuid').notNullable().references('uuid').inTable('users').onDelete('CASCADE');
		table
			.string('access_template_uuid')
			.nullable()
			.references('uuid')
			.inTable('access_templates')
			.onDelete('SET NULL');

		table.integer('navigation_id').notNullable();
		table.integer('catalog_id').notNullable();
		table.string('catalog', 100).notNullable();
		table.string('main_navigation', 200).notNullable();
		table.string('sub_navigation', 200).notNullable();

		table.text('remarks').nullable();
		table.boolean('has_access').notNullable().defaultTo(false);

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['user_uuid', 'catalog', 'main_navigation', 'sub_navigation']);
		table.index(['tenant_uuid', 'user_uuid']);
		table.index(['user_uuid', 'has_access']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('user_accesses');
}
