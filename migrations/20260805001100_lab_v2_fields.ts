import type { Knex } from 'knex';

/**
 * V2 schema additions from the "Hinigaran" real-world template analysis:
 *
 *   patients.civil_status               single/married/widowed/separated/divorced
 *   item_categories.color               hex color for the printed section band
 *   item_categories.print_title         "C L I N I C A L   C H E M I S T R Y"
 *   item_categories.print_template      default | sectioned | narrative | matrix
 *   lab_reports.specimen_collected_at   "Time Taken" (manual input on editor)
 *   test_item_components.section        optional sub-heading label for grouped panels
 *                                       (Urinalysis: Physical / Chemical / Microscopic)
 *   test_items.matrix_config            JSON { rows: [...], cols: [...] } for
 *                                       matrix result_type (Fecalysis parasitology)
 *   lab_report_items.matrix_config      snapshot for reprintability
 *   result_type CHECK extended to include 'matrix'
 */
// Idempotent add — some columns may already exist from earlier iterations.
async function addColumnIfMissing(
	knex: Knex,
	table: string,
	column: string,
	build: (t: Knex.CreateTableBuilder) => void,
): Promise<void> {
	const exists = await knex.schema.hasColumn(table, column);
	if (exists) return;
	await knex.schema.alterTable(table, (t) => build(t as any));
}

export async function up(knex: Knex): Promise<void> {
	await addColumnIfMissing(knex, 'patients', 'civil_status', (t) => t.string('civil_status', 30).nullable());
	await addColumnIfMissing(knex, 'item_categories', 'color', (t) => t.string('color', 20).nullable());
	await addColumnIfMissing(knex, 'item_categories', 'print_title', (t) => t.string('print_title', 255).nullable());
	await addColumnIfMissing(knex, 'item_categories', 'print_template', (t) => t.string('print_template', 30).nullable());
	await addColumnIfMissing(knex, 'lab_reports', 'specimen_collected_at', (t) => t.timestamp('specimen_collected_at', { useTz: true }).nullable());
	await addColumnIfMissing(knex, 'test_item_components', 'section', (t) => t.string('section', 100).nullable());
	await addColumnIfMissing(knex, 'test_items', 'matrix_config', (t) => t.jsonb('matrix_config').nullable());
	await addColumnIfMissing(knex, 'lab_report_items', 'matrix_config', (t) => t.jsonb('matrix_config').nullable());

	// Extend the result_type check constraints to allow 'matrix'.
	await knex.raw(`ALTER TABLE test_items DROP CONSTRAINT IF EXISTS test_items_result_type_check`);
	await knex.raw(`
		ALTER TABLE test_items
		ADD CONSTRAINT test_items_result_type_check
		CHECK (result_type IN ('single','panel','narrative','culture','matrix'))
	`);
	await knex.raw(`ALTER TABLE lab_report_items DROP CONSTRAINT IF EXISTS lab_report_items_result_type_check`);
	await knex.raw(`
		ALTER TABLE lab_report_items
		ADD CONSTRAINT lab_report_items_result_type_check
		CHECK (result_type IN ('single','panel','narrative','culture','matrix'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.raw(`ALTER TABLE lab_report_items DROP CONSTRAINT IF EXISTS lab_report_items_result_type_check`);
	await knex.raw(`
		ALTER TABLE lab_report_items
		ADD CONSTRAINT lab_report_items_result_type_check
		CHECK (result_type IN ('single','panel','narrative','culture'))
	`);
	await knex.raw(`ALTER TABLE test_items DROP CONSTRAINT IF EXISTS test_items_result_type_check`);
	await knex.raw(`
		ALTER TABLE test_items
		ADD CONSTRAINT test_items_result_type_check
		CHECK (result_type IN ('single','panel','narrative','culture'))
	`);
	await knex.schema.alterTable('lab_report_items', (t) => t.dropColumn('matrix_config'));
	await knex.schema.alterTable('test_items', (t) => t.dropColumn('matrix_config'));
	await knex.schema.alterTable('test_item_components', (t) => t.dropColumn('section'));
	await knex.schema.alterTable('lab_reports', (t) => t.dropColumn('specimen_collected_at'));
	await knex.schema.alterTable('item_categories', (t) => {
		t.dropColumn('print_template');
		t.dropColumn('print_title');
		t.dropColumn('color');
	});
	await knex.schema.alterTable('patients', (t) => t.dropColumn('civil_status'));
}
