/* eslint-disable no-console */
import knexFactory from 'knex';
import config from '../knexfile';

const TENANT_UUID = 'a558c4e5-cdb9-40a8-ab10-cb2ed95e53c3';

async function main() {
	const knex = knexFactory(config);
	try {
		const row = await knex('test_items')
			.where({ tenant_uuid: TENANT_UUID, code: 'CM002' })
			.first();
		if (!row) {
			console.log('CM002 not found in tenant', TENANT_UUID);
			return;
		}
		console.log('CM002:', JSON.stringify(row, null, 2));
		const comps = await knex('test_item_components')
			.where({ test_item_uuid: row.uuid })
			.orderBy('display_order');
		console.log(`Existing components (${comps.length}):`);
		for (const c of comps) console.log(' ', c.display_order, c.section ?? '(no section)', '|', c.code, c.name);
	} finally {
		await knex.destroy();
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
