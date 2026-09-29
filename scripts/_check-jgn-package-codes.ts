/* eslint-disable no-console */
import knexFactory from 'knex';
import config from '../knexfile';

const TENANT_UUID = 'a558c4e5-cdb9-40a8-ab10-cb2ed95e53c3';
const CODES = [
	'CC001', 'CC003', 'CC005', 'CC006', 'CC007', 'CC008', 'CC010', 'CC011',
	'HH001', 'HH003', 'CM001', 'SS001', 'SS002',
];

async function main() {
	const knex = knexFactory(config);
	try {
		const rows: Array<{ code: string; name: string; price: string | number }> = await knex('test_items')
			.where({ tenant_uuid: TENANT_UUID })
			.whereIn('code', CODES)
			.select('code', 'name', 'price');
		const byCode = new Map(rows.map((r) => [r.code, r]));
		const missing: string[] = [];
		for (const c of CODES) {
			if (byCode.has(c)) {
				const r = byCode.get(c)!;
				console.log(`  present  ${c.padEnd(6)} ${String(r.name).padEnd(30)} DB price=${r.price}`);
			} else {
				missing.push(c);
				console.log(`  MISSING  ${c}`);
			}
		}
		console.log(`\nFound ${rows.length}/${CODES.length} · missing: ${missing.join(', ') || 'none'}`);
	} finally {
		await knex.destroy();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
