import knex from 'knex';
import { v4 as uuidv4 } from 'uuid';
import config from '../knexfile';

const TENANT_UUID = 'a558c4e5-cdb9-40a8-ab10-cb2ed95e53c3';
const SOURCE_NAME = 'Complete Blood Count';
const TARGET_NAME = 'CBC with Platelet count';

const COMMIT = process.argv.includes('--commit');

async function main() {
	const db = knex(config);
	try {
		const items = await db('test_items')
			.where({ tenant_uuid: TENANT_UUID })
			.whereRaw('LOWER(name) IN (?, ?)', [SOURCE_NAME.toLowerCase(), TARGET_NAME.toLowerCase()])
			.select('uuid', 'name', 'code', 'result_type', 'status');

		console.log(`Matching test_items in tenant ${TENANT_UUID}:`);
		for (const r of items) {
			console.log(
				`  ${r.uuid}  [${r.code}]  ${r.name}  (result_type=${r.result_type}, status=${r.status})`,
			);
		}
		console.log();

		const source = items.find((r) => r.name.toLowerCase() === SOURCE_NAME.toLowerCase());
		const target = items.find((r) => r.name.toLowerCase() === TARGET_NAME.toLowerCase());

		if (!source) throw new Error(`Source not found: "${SOURCE_NAME}"`);
		if (!target) throw new Error(`Target not found: "${TARGET_NAME}"`);
		if (source.uuid === target.uuid) throw new Error('Source and target resolved to same row');

		const sourceComps = await db('test_item_components')
			.where({ test_item_uuid: source.uuid })
			.orderBy('display_order', 'asc');
		const targetComps = await db('test_item_components')
			.where({ test_item_uuid: target.uuid })
			.orderBy('display_order', 'asc');

		console.log(`Source "${source.name}" (${source.uuid}) has ${sourceComps.length} components:`);
		for (const c of sourceComps) {
			console.log(`  ${String(c.display_order).padStart(3)}  [${c.code}]  ${c.name}`);
		}
		console.log();
		console.log(`Target "${target.name}" (${target.uuid}) currently has ${targetComps.length} components:`);
		for (const c of targetComps) {
			console.log(`  ${String(c.display_order).padStart(3)}  [${c.code}]  ${c.name}`);
		}
		console.log();

		if (!COMMIT) {
			console.log('DRY RUN — pass --commit to execute the following:');
			console.log(`  1) DELETE ${targetComps.length} rows from test_item_components where test_item_uuid=${target.uuid}`);
			console.log(`  2) INSERT ${sourceComps.length} rows cloned from source into target`);
			return;
		}

		await db.transaction(async (trx) => {
			const deleted = await trx('test_item_components')
				.where({ test_item_uuid: target.uuid })
				.delete();

			const now = new Date();
			const rows = sourceComps.map((c) => ({
				uuid: uuidv4(),
				tenant_uuid: TENANT_UUID,
				test_item_uuid: target.uuid,
				code: c.code,
				name: c.name,
				unit_of_measure: c.unit_of_measure,
				reference_range: c.reference_range,
				lookup_values: c.lookup_values,
				section: c.section,
				display_order: c.display_order,
				si_conversion_factor: c.si_conversion_factor,
				si_unit_of_measure: c.si_unit_of_measure,
				si_reference_range: c.si_reference_range,
				created_by: c.created_by,
				updated_by: c.updated_by,
				created_at: now,
				updated_at: now,
			}));

			if (rows.length) await trx('test_item_components').insert(rows);

			console.log(`COMMITTED — deleted ${deleted} old target rows, inserted ${rows.length} copies`);
		});

		const finalComps = await db('test_item_components')
			.where({ test_item_uuid: target.uuid })
			.orderBy('display_order', 'asc');
		console.log(`Target "${target.name}" now has ${finalComps.length} components:`);
		for (const c of finalComps) {
			console.log(`  ${String(c.display_order).padStart(3)}  [${c.code}]  ${c.name}`);
		}
	} finally {
		await db.destroy();
	}
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
