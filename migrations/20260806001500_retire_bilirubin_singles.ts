import type { Knex } from 'knex';

/**
 * Retire the individual Bilirubin single-value test items now that the
 * combined `BILI` panel (installed by migration 20260806001400) captures
 * all three fractions on one row. Targets:
 *   codes: BILI-T, BILI-D, BILI-I
 *   names (any case): 'Bilirubin Total', 'Total Bilirubin',
 *                     'Bilirubin Direct', 'Direct Bilirubin',
 *                     'Bilirubin Indirect', 'Indirect Bilirubin'
 *
 * Handling references so the migration is safe on live data:
 *   - item_package_items.test_item_uuid (FK, ON DELETE default) →
 *       we DON'T delete rows referenced by a package; we deactivate
 *       (status='inactive') instead so pickers hide them but the FK
 *       stays intact and the package continues to bill correctly.
 *   - lab_report_items.test_item_uuid (FK ON DELETE SET NULL) →
 *       safe to delete; historic report snapshots keep their own code/name.
 *   - patient_requisition_items has NO FK on test_item (schema-checked),
 *       so requisitions are unaffected.
 *   - test_item_components: rows on the retired test_items get deleted
 *       when we delete their parent.
 *
 * Never touches the new `BILI` panel or its components (which SHARE the
 * codes BILI-T/D/I in `test_item_components` — different table, no clash).
 */
const LEGACY_CODES = ['BILI-T', 'BILI-D', 'BILI-I'];
const LEGACY_NAMES_LOWER = [
	'bilirubin total', 'total bilirubin',
	'bilirubin direct', 'direct bilirubin',
	'bilirubin indirect', 'indirect bilirubin',
];

export async function up(knex: Knex): Promise<void> {
	// Find every candidate single test_item across all tenants. Only touch
	// result_type='single' — we must never touch the new BILI panel row.
	const candidates = await knex('test_items')
		.where('result_type', 'single')
		.andWhere((qb) => {
			qb.whereIn('code', LEGACY_CODES);
			for (const n of LEGACY_NAMES_LOWER) qb.orWhereRaw('LOWER(name) = ?', [n]);
		})
		.select('uuid', 'tenant_uuid', 'code', 'name');

	for (const t of candidates) {
		// If a package still references this test item, we can't drop the FK
		// row — deactivate instead so it hides from active pickers while the
		// package continues to work.
		const referenced = await knex('item_package_items')
			.where({ test_item_uuid: t.uuid })
			.first('uuid');

		if (referenced) {
			await knex('test_items')
				.where({ uuid: t.uuid })
				.update({ status: 'inactive', updated_by: 'migration:20260806001500' });
			continue;
		}

		// Not referenced by any package — safe to delete outright. Wipe any
		// component rows first (they'd otherwise dangle) even though singles
		// typically have none.
		await knex('test_item_components').where({ test_item_uuid: t.uuid }).delete();
		await knex('test_items').where({ uuid: t.uuid }).delete();
	}
}

export async function down(_knex: Knex): Promise<void> {
	// Irreversible — we can't distinguish "deactivated by this migration"
	// from "deactivated for another reason" without stashing extra state,
	// and we can't resurrect deleted rows without their original uuids.
	// Restore from a backup if this needs undoing.
}
