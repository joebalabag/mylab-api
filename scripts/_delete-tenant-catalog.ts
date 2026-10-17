import knex from 'knex';
import config from '../knexfile';

// Fill this in before running. The script refuses to execute with the
// zero-UUID so you can't accidentally fire it against the wrong tenant.
const TENANT_UUID = '00000000-0000-0000-0000-000000000000';

const COMMIT = process.argv.includes('--commit');

// FK-safe delete order (children before parents):
//   item_package_items  -> item_packages, test_items
//   item_packages       -> tenant
//   test_item_components -> test_items
//   test_items          -> item_categories
//   item_categories     -> item_groups
//   item_groups         -> tenant
const DELETE_ORDER = [
	'item_package_items',
	'item_packages',
	'test_item_components',
	'test_items',
	'item_categories',
	'item_groups',
] as const;

async function main() {
	if (TENANT_UUID === '00000000-0000-0000-0000-000000000000') {
		throw new Error('Set TENANT_UUID at the top of this file before running.');
	}

	const db = knex(config);

	try {
		console.log(`Target tenant: ${TENANT_UUID}`);
		console.log();

		const before: Record<string, number> = {};
		for (const table of DELETE_ORDER) {
			const [{ count }] = await db(table).where({ tenant_uuid: TENANT_UUID }).count();
			before[table] = Number(count);
		}

		console.log('Row counts (BEFORE):');
		for (const table of DELETE_ORDER) {
			console.log(`  ${table.padEnd(22)} : ${before[table]}`);
		}
		console.log();

		const totalBefore = Object.values(before).reduce((a, b) => a + b, 0);
		if (totalBefore === 0) {
			console.log('Nothing to delete for this tenant.');
			return;
		}

		// Catalog rows are often referenced by snapshotted lab-report data via
		// test_item_uuid / test_item_component_uuid / item_package_uuid. Those
		// FKs may be ON DELETE SET NULL or RESTRICT depending on the migration.
		// If RESTRICT, the delete will fail here — that's the safe outcome; it
		// means a lab report still points at these catalog rows and you need
		// to decide whether to purge reports first or keep the catalog.
		console.log(
			'WARNING: this will DELETE every row above for this tenant. Lab reports / ' +
				'lab result values snapshot catalog FKs — if any still reference these ' +
				'rows via ON DELETE RESTRICT, the transaction will roll back.',
		);
		console.log();

		if (!COMMIT) {
			console.log('DRY RUN — no changes written. Pass --commit to execute.');
			return;
		}

		const deleted: Record<string, number> = {};
		await db.transaction(async (trx) => {
			for (const table of DELETE_ORDER) {
				const n = await trx(table).where({ tenant_uuid: TENANT_UUID }).delete();
				deleted[table] = n;
			}
		});

		console.log('Rows deleted:');
		for (const table of DELETE_ORDER) {
			console.log(`  ${table.padEnd(22)} : ${deleted[table]}`);
		}
		console.log();
		console.log('COMMITTED.');

		const after: Record<string, number> = {};
		for (const table of DELETE_ORDER) {
			const [{ count }] = await db(table).where({ tenant_uuid: TENANT_UUID }).count();
			after[table] = Number(count);
		}

		console.log();
		console.log('Row counts (AFTER):');
		for (const table of DELETE_ORDER) {
			console.log(`  ${table.padEnd(22)} : ${after[table]}`);
		}
	} finally {
		await db.destroy();
	}
}

main().catch((e) => {
	console.error(e.stack || e.message);
	process.exit(1);
});
