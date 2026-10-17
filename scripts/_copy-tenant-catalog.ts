import knex from 'knex';
import { v4 as uuidv4 } from 'uuid';
import config from '../knexfile';

const SRC_TENANT = 'a558c4e5-cdb9-40a8-ab10-cb2ed95e53c3';
const TGT_TENANT = 'aa59718d-2a06-4c76-9c40-a86dd31ec7e5';

const COMMIT = process.argv.includes('--commit');

type Row = Record<string, any>;

function remap<T extends Row>(row: T, overrides: Row): T {
	const { ...rest } = row;
	return { ...rest, ...overrides } as T;
}

async function main() {
	const db = knex(config);
	const now = new Date();

	try {
		const [groups, categories, testItems, components, packages, packageItems, doctors, discounts] =
			await Promise.all([
				db('item_groups').where({ tenant_uuid: SRC_TENANT }).orderBy('created_at'),
				db('item_categories').where({ tenant_uuid: SRC_TENANT }).orderBy('created_at'),
				db('test_items').where({ tenant_uuid: SRC_TENANT }).orderBy('created_at'),
				db('test_item_components').where({ tenant_uuid: SRC_TENANT }).orderBy('created_at'),
				db('item_packages').where({ tenant_uuid: SRC_TENANT }).orderBy('created_at'),
				db('item_package_items').where({ tenant_uuid: SRC_TENANT }).orderBy('created_at'),
				db('doctors').where({ tenant_uuid: SRC_TENANT }).orderBy('created_at'),
				db('discounts').where({ tenant_uuid: SRC_TENANT }).orderBy('created_at'),
			]);

		console.log('Source tenant row counts:');
		console.log(`  item_groups          : ${groups.length}`);
		console.log(`  item_categories      : ${categories.length}`);
		console.log(`  test_items           : ${testItems.length}`);
		console.log(`  test_item_components : ${components.length}`);
		console.log(`  item_packages        : ${packages.length}`);
		console.log(`  item_package_items   : ${packageItems.length}`);
		console.log(`  doctors              : ${doctors.length}`);
		console.log(`  discounts            : ${discounts.length}`);
		console.log();

		const [{ count: tgtGroups }] = await db('item_groups')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: tgtCats }] = await db('item_categories')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: tgtTests }] = await db('test_items')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: tgtPacks }] = await db('item_packages')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: tgtDocs }] = await db('doctors').where({ tenant_uuid: TGT_TENANT }).count();
		const [{ count: tgtDiscs }] = await db('discounts')
			.where({ tenant_uuid: TGT_TENANT })
			.count();

		console.log('Target tenant row counts (BEFORE):');
		console.log(`  item_groups          : ${tgtGroups}`);
		console.log(`  item_categories      : ${tgtCats}`);
		console.log(`  test_items           : ${tgtTests}`);
		console.log(`  item_packages        : ${tgtPacks}`);
		console.log(`  doctors              : ${tgtDocs}`);
		console.log(`  discounts            : ${tgtDiscs}`);
		console.log();

		if (
			Number(tgtGroups) +
				Number(tgtCats) +
				Number(tgtTests) +
				Number(tgtPacks) +
				Number(tgtDocs) +
				Number(tgtDiscs) >
			0
		) {
			console.warn(
				'WARNING: target tenant already has some catalog data. Codes are unique per tenant — ' +
					'duplicate codes will fail. Review the summary above before --commit.',
			);
			console.log();
		}

		const doctorIdMap = new Map<string, string>();
		const groupIdMap = new Map<string, string>();
		const categoryIdMap = new Map<string, string>();
		const testItemIdMap = new Map<string, string>();
		const packageIdMap = new Map<string, string>();

		for (const d of doctors) doctorIdMap.set(d.uuid, uuidv4());
		for (const g of groups) groupIdMap.set(g.uuid, uuidv4());
		for (const c of categories) categoryIdMap.set(c.uuid, uuidv4());
		for (const t of testItems) testItemIdMap.set(t.uuid, uuidv4());
		for (const p of packages) packageIdMap.set(p.uuid, uuidv4());

		const doctorRows = doctors.map((d) =>
			remap(d, {
				uuid: doctorIdMap.get(d.uuid)!,
				tenant_uuid: TGT_TENANT,
				created_at: now,
				updated_at: now,
			}),
		);

		const groupRows = groups.map((g) =>
			remap(g, {
				uuid: groupIdMap.get(g.uuid)!,
				tenant_uuid: TGT_TENANT,
				signatory_doctor_uuid: g.signatory_doctor_uuid
					? doctorIdMap.get(g.signatory_doctor_uuid) ?? null
					: null,
				created_at: now,
				updated_at: now,
			}),
		);

		const categoryRows = categories.map((c) => {
			const newGroup = groupIdMap.get(c.item_group_uuid);
			if (!newGroup) {
				throw new Error(
					`Category ${c.uuid} (${c.code}) references missing item_group ${c.item_group_uuid}`,
				);
			}
			return remap(c, {
				uuid: categoryIdMap.get(c.uuid)!,
				tenant_uuid: TGT_TENANT,
				item_group_uuid: newGroup,
				created_at: now,
				updated_at: now,
			});
		});

		const testItemRows = testItems.map((t) => {
			const newCat = categoryIdMap.get(t.item_category_uuid);
			if (!newCat) {
				throw new Error(
					`Test item ${t.uuid} (${t.code}) references missing item_category ${t.item_category_uuid}`,
				);
			}
			return remap(t, {
				uuid: testItemIdMap.get(t.uuid)!,
				tenant_uuid: TGT_TENANT,
				item_category_uuid: newCat,
				created_at: now,
				updated_at: now,
			});
		});

		const componentRows = components.map((c) => {
			const newTest = testItemIdMap.get(c.test_item_uuid);
			if (!newTest) {
				throw new Error(
					`Component ${c.uuid} (${c.code}) references missing test_item ${c.test_item_uuid}`,
				);
			}
			return remap(c, {
				uuid: uuidv4(),
				tenant_uuid: TGT_TENANT,
				test_item_uuid: newTest,
				created_at: now,
				updated_at: now,
			});
		});

		const packageRows = packages.map((p) =>
			remap(p, {
				uuid: packageIdMap.get(p.uuid)!,
				tenant_uuid: TGT_TENANT,
				created_at: now,
				updated_at: now,
			}),
		);

		const packageItemRows = packageItems.map((pi) => {
			const newPkg = packageIdMap.get(pi.item_package_uuid);
			const newTest = testItemIdMap.get(pi.test_item_uuid);
			if (!newPkg) {
				throw new Error(
					`Package item ${pi.uuid} references missing item_package ${pi.item_package_uuid}`,
				);
			}
			if (!newTest) {
				throw new Error(
					`Package item ${pi.uuid} references missing test_item ${pi.test_item_uuid}`,
				);
			}
			return remap(pi, {
				uuid: uuidv4(),
				tenant_uuid: TGT_TENANT,
				item_package_uuid: newPkg,
				test_item_uuid: newTest,
				created_at: now,
				updated_at: now,
			});
		});

		const discountRows = discounts.map((d) =>
			remap(d, {
				uuid: uuidv4(),
				tenant_uuid: TGT_TENANT,
				created_at: now,
				updated_at: now,
			}),
		);

		console.log('Rows prepared for insert into target tenant:');
		console.log(`  doctors              : ${doctorRows.length}`);
		console.log(`  item_groups          : ${groupRows.length}`);
		console.log(`  item_categories      : ${categoryRows.length}`);
		console.log(`  test_items           : ${testItemRows.length}`);
		console.log(`  test_item_components : ${componentRows.length}`);
		console.log(`  item_packages        : ${packageRows.length}`);
		console.log(`  item_package_items   : ${packageItemRows.length}`);
		console.log(`  discounts            : ${discountRows.length}`);
		console.log();

		if (!COMMIT) {
			console.log('DRY RUN — pass --commit to apply.');
			return;
		}

		await db.transaction(async (trx) => {
			if (doctorRows.length) await trx('doctors').insert(doctorRows);
			if (groupRows.length) await trx('item_groups').insert(groupRows);
			if (categoryRows.length) await trx('item_categories').insert(categoryRows);
			if (testItemRows.length) await trx('test_items').insert(testItemRows);
			if (componentRows.length) await trx('test_item_components').insert(componentRows);
			if (packageRows.length) await trx('item_packages').insert(packageRows);
			if (packageItemRows.length) await trx('item_package_items').insert(packageItemRows);
			if (discountRows.length) await trx('discounts').insert(discountRows);
		});

		console.log('COMMITTED.');

		const [{ count: aGroups }] = await db('item_groups')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: aCats }] = await db('item_categories')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: aTests }] = await db('test_items')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: aComps }] = await db('test_item_components')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: aPacks }] = await db('item_packages')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: aPackItems }] = await db('item_package_items')
			.where({ tenant_uuid: TGT_TENANT })
			.count();
		const [{ count: aDocs }] = await db('doctors').where({ tenant_uuid: TGT_TENANT }).count();
		const [{ count: aDiscs }] = await db('discounts')
			.where({ tenant_uuid: TGT_TENANT })
			.count();

		console.log('Target tenant row counts (AFTER):');
		console.log(`  item_groups          : ${aGroups}`);
		console.log(`  item_categories      : ${aCats}`);
		console.log(`  test_items           : ${aTests}`);
		console.log(`  test_item_components : ${aComps}`);
		console.log(`  item_packages        : ${aPacks}`);
		console.log(`  item_package_items   : ${aPackItems}`);
		console.log(`  doctors              : ${aDocs}`);
		console.log(`  discounts            : ${aDiscs}`);
	} finally {
		await db.destroy();
	}
}

main().catch((e) => {
	console.error(e.stack || e.message);
	process.exit(1);
});
