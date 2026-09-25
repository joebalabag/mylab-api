import type { Knex } from 'knex';

/**
 * SI conversion metadata for Clinical Chemistry test items. Chemistry analytes
 * are commonly reported in both conventional and SI units (e.g. glucose:
 * 100 mg/dL × 0.0555 = 5.55 mmol/L). The multiplier converts the raw
 * conventional value to SI; si_unit_of_measure and si_reference_range are
 * the labels/ranges that print alongside the conventional column.
 *
 * Columns land on:
 *   test_items                 — for result_type='single'
 *   test_item_components       — for result_type='panel' (per component)
 *   lab_report_items           — snapshot when the report is drafted
 *   lab_result_values          — snapshot per row/component so historical
 *                                 reports print consistently even after the
 *                                 catalog changes
 *
 * Idempotent (uses hasColumn) so reruns don't blow up.
 */
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
	await addColumnIfMissing(knex, 'test_items', 'si_conversion_factor', (t) =>
		t.decimal('si_conversion_factor', 18, 8).nullable(),
	);
	await addColumnIfMissing(knex, 'test_items', 'si_unit_of_measure', (t) =>
		t.string('si_unit_of_measure', 50).nullable(),
	);
	await addColumnIfMissing(knex, 'test_items', 'si_reference_range', (t) =>
		t.string('si_reference_range', 500).nullable(),
	);

	await addColumnIfMissing(knex, 'test_item_components', 'si_conversion_factor', (t) =>
		t.decimal('si_conversion_factor', 18, 8).nullable(),
	);
	await addColumnIfMissing(knex, 'test_item_components', 'si_unit_of_measure', (t) =>
		t.string('si_unit_of_measure', 50).nullable(),
	);
	await addColumnIfMissing(knex, 'test_item_components', 'si_reference_range', (t) =>
		t.string('si_reference_range', 500).nullable(),
	);

	await addColumnIfMissing(knex, 'lab_report_items', 'si_conversion_factor', (t) =>
		t.decimal('si_conversion_factor', 18, 8).nullable(),
	);
	await addColumnIfMissing(knex, 'lab_report_items', 'si_unit_of_measure', (t) =>
		t.string('si_unit_of_measure', 50).nullable(),
	);
	await addColumnIfMissing(knex, 'lab_report_items', 'si_reference_range', (t) =>
		t.string('si_reference_range', 500).nullable(),
	);

	await addColumnIfMissing(knex, 'lab_result_values', 'si_conversion_factor', (t) =>
		t.decimal('si_conversion_factor', 18, 8).nullable(),
	);
	await addColumnIfMissing(knex, 'lab_result_values', 'si_unit_of_measure', (t) =>
		t.string('si_unit_of_measure', 50).nullable(),
	);
	await addColumnIfMissing(knex, 'lab_result_values', 'si_reference_range', (t) =>
		t.string('si_reference_range', 500).nullable(),
	);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_result_values', (t) => {
		t.dropColumn('si_reference_range');
		t.dropColumn('si_unit_of_measure');
		t.dropColumn('si_conversion_factor');
	});
	await knex.schema.alterTable('lab_report_items', (t) => {
		t.dropColumn('si_reference_range');
		t.dropColumn('si_unit_of_measure');
		t.dropColumn('si_conversion_factor');
	});
	await knex.schema.alterTable('test_item_components', (t) => {
		t.dropColumn('si_reference_range');
		t.dropColumn('si_unit_of_measure');
		t.dropColumn('si_conversion_factor');
	});
	await knex.schema.alterTable('test_items', (t) => {
		t.dropColumn('si_reference_range');
		t.dropColumn('si_unit_of_measure');
		t.dropColumn('si_conversion_factor');
	});
}
