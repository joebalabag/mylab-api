import knex from 'knex';
import config from '../knexfile';

const TENANT_UUID = 'a558c4e5-cdb9-40a8-ab10-cb2ed95e53c3';

async function main() {
	const db = knex(config);
	try {
		const rows = await db('test_items')
			.where({ tenant_uuid: TENANT_UUID })
			.andWhere((qb) =>
				qb
					.whereRaw('LOWER(name) LIKE ?', ['%platelet%'])
					.orWhereRaw('LOWER(name) LIKE ?', ['%blood count%'])
					.orWhereRaw('LOWER(code) LIKE ?', ['%cbc%'])
					.orWhereRaw('LOWER(code) LIKE ?', ['%plt%']),
			)
			.select('uuid', 'code', 'name', 'result_type', 'status')
			.orderBy('name', 'asc');

		console.log(`Candidates in tenant ${TENANT_UUID}:`);
		for (const r of rows) {
			console.log(`  ${r.uuid}  [${r.code}]  ${r.name}  (${r.result_type}, ${r.status})`);
		}
	} finally {
		await db.destroy();
	}
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
