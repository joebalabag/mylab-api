/* eslint-disable no-console */
import knexFactory from 'knex';
import config from '../knexfile';

const TENANT_UUID = 'a558c4e5-cdb9-40a8-ab10-cb2ed95e53c3';
const TEST_CODES = ['CM002', 'CM004'];
const ACTOR = 'script:_update-cm002-components';

interface Row {
	code: string;
	name: string;
	section: string;
	display_order: number;
}

const TARGET: Row[] = [
	{ code: 'COLOR',        name: 'Color',                        section: 'Physical Properties', display_order: 0 },
	{ code: 'CONSIST',      name: 'Consistency',                  section: 'Physical Properties', display_order: 1 },
	{ code: 'OCCULT',       name: 'Occult Blood',                 section: 'Chemical Examination', display_order: 2 },
	{ code: 'PUSCELLS',     name: 'Pus Cells',                    section: 'Microscopic Findings', display_order: 3 },
	{ code: 'RBC',          name: 'Red Blood Cells',              section: 'Microscopic Findings', display_order: 4 },
	{ code: 'HELMINTHS',    name: 'Helminths',                    section: 'Microscopic Findings', display_order: 5 },
	{ code: 'ASCARIS',      name: 'Ascaris',                      section: 'Microscopic Findings', display_order: 6 },
	{ code: 'HOOKWORM',     name: 'Hookworm',                     section: 'Microscopic Findings', display_order: 7 },
	{ code: 'TRICHURIS',    name: 'Trichuris',                    section: 'Microscopic Findings', display_order: 8 },
	{ code: 'EHIST',        name: 'Entamoeba histolytica',        section: 'Microscopic Findings', display_order: 9 },
	{ code: 'EHIST-T',      name: 'E. histolytica Trophozoite',   section: 'Microscopic Findings', display_order: 10 },
	{ code: 'ECOLI',        name: 'Entamoeba coli',               section: 'Microscopic Findings', display_order: 11 },
	{ code: 'ECOLI-T',      name: 'E. coli Trophozoite',          section: 'Microscopic Findings', display_order: 12 },
	{ code: 'OTHERS',       name: 'Others',                       section: 'Others',              display_order: 13 },
];

async function main() {
	const knex = knexFactory(config);
	try {
		await knex.transaction(async (trx) => {
			let totalUpdated = 0;
			let totalInserted = 0;

			for (const code of TEST_CODES) {
				const parent = await trx('test_items')
					.where({ tenant_uuid: TENANT_UUID, code })
					.first('uuid', 'name', 'result_type');
				if (!parent) {
					console.log(`SKIP ${code} — not found in tenant ${TENANT_UUID}`);
					continue;
				}
				if (parent.result_type !== 'panel') {
					// Flip single → panel so components can attach. Refuse the flip
					// if any lab_report_item already snapshotted this test — the
					// existing rows expect the old shape and results would render
					// wrong.
					const usage: any = await trx('lab_report_items')
						.where({ test_item_uuid: parent.uuid })
						.count({ n: '*' })
						.first();
					const n = Number(usage?.n ?? 0);
					if (n > 0) {
						throw new Error(
							`Test item ${code} is '${parent.result_type}' and already has ${n} lab_report_items snapshot(s). ` +
								`Refusing to flip to panel — would break existing results. Handle manually.`,
						);
					}
					await trx('test_items').where({ uuid: parent.uuid }).update({
						result_type: 'panel',
						updated_by: ACTOR,
						updated_at: new Date(),
					});
					console.log(`\nParent: ${code} · ${parent.name} (${parent.uuid}) — flipped '${parent.result_type}' → 'panel' (no existing lab_report_items)`);
					parent.result_type = 'panel';
				} else {
					console.log(`\nParent: ${code} · ${parent.name} (${parent.uuid})`);
				}

				const existing = await trx('test_item_components')
					.where({ test_item_uuid: parent.uuid })
					.select('uuid', 'code', 'name', 'section', 'display_order');
				const byCode = new Map(existing.map((r) => [r.code, r]));

				let updated = 0;
				let inserted = 0;

				for (const t of TARGET) {
					const cur = byCode.get(t.code);
					if (cur) {
						await trx('test_item_components').where({ uuid: cur.uuid }).update({
							name: t.name,
							section: t.section,
							display_order: t.display_order,
							updated_by: ACTOR,
							updated_at: new Date(),
						});
						console.log(`  updated  ${t.display_order.toString().padStart(2)}  [${t.section}]  ${t.code} · ${t.name}`);
						updated += 1;
					} else {
						await trx('test_item_components').insert({
							tenant_uuid: TENANT_UUID,
							test_item_uuid: parent.uuid,
							code: t.code,
							name: t.name,
							section: t.section,
							display_order: t.display_order,
							created_by: ACTOR,
						});
						console.log(`  inserted ${t.display_order.toString().padStart(2)}  [${t.section}]  ${t.code} · ${t.name}`);
						inserted += 1;
					}
				}
				console.log(`  → ${code}: updated=${updated}, inserted=${inserted}`);
				totalUpdated += updated;
				totalInserted += inserted;
			}

			console.log(`\nTotals across ${TEST_CODES.length} test(s): updated=${totalUpdated}, inserted=${totalInserted}, target rows per test=${TARGET.length}`);
		});
	} finally {
		await knex.destroy();
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
