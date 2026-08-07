import type { Knex } from 'knex';

/**
 * Individual orderable tests. Sits under item_categories (Category belongs to
 * Item Group). `result_type` drives the report renderer's automatic template
 * dispatch — no operator-side template picker:
 *
 *   single    — one numeric/text result on a single line
 *                 (Chemistry analyte, Endocrinology hormone, single-target PCR)
 *   panel     — fixed set of sub-results on one report
 *                 (CBC, Urinalysis, Lipid Profile, Thyroid Panel)
 *   narrative — free-text sectioned report (impression + description)
 *                 (Histopathology, Cytology, ANY imaging read: X-ray, UTZ, CT, MRI)
 *   culture   — organism identification + antibiotic-sensitivity matrix
 *                 (Microbiology C&S)
 *
 * `specimen` is deliberately generic — holds "Serum" for chemistry, "Chest PA"
 * for X-ray, "Right Upper Quadrant" for UTZ, "12-lead" for ECG, etc.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('test_items', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table
			.string('item_category_uuid')
			.notNullable()
			.references('uuid')
			.inTable('item_categories')
			.onDelete('RESTRICT');

		table.string('code', 100).notNullable();
		table.string('name', 500).notNullable();
		table.string('result_type', 30).notNullable().defaultTo('single');

		table.string('specimen', 255).nullable();
		table.string('unit_of_measure', 50).nullable();
		table.string('reference_range', 500).nullable();

		table.decimal('price', 14, 2).notNullable().defaultTo(0);
		table.text('description').nullable();

		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'code']);
		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'item_category_uuid']);
		table.index(['tenant_uuid', 'result_type']);
	});

	// Portable check-constraint on result_type so a bad value can't sneak in
	// through direct SQL (the DTO enforces it at the API boundary too).
	await knex.raw(`
		ALTER TABLE test_items
		ADD CONSTRAINT test_items_result_type_check
		CHECK (result_type IN ('single','panel','narrative','culture'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('test_items');
}
