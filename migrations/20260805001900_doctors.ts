import type { Knex } from 'knex';

/**
 * Per-tenant roster of doctors (signatories on lab results, radiology
 * reports, etc.). Referenced later from the lab-report finalize UI to
 * populate the pathologist snapshot with name + license + e-signature.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('doctors', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');

		table.string('name', 255).notNullable();
		table.string('license_number', 100).nullable();
		table.string('specialty', 100).notNullable();
		// /public/uploads/tenants/doctor-esignature/YYYY/MM/<uuid>.<ext>
		table.string('esignature_image').nullable();

		table.string('status', 20).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'specialty']);
		table.index(['tenant_uuid', 'name']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('doctors');
}
