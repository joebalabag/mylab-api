import knex from 'knex';
import config from '../knexfile';

async function main() {
	const db = knex(config);
	const rows = await db('access_templates').orderBy('navigation_id', 'asc');
	console.log(`total: ${rows.length}`);
	console.log();
	for (const r of rows) {
		console.log(
			`${String(r.navigation_id).padStart(2)}. [${r.catalog}] ${r.main_navigation} > ${r.sub_navigation}`,
		);
		console.log(`    ${r.remarks}`);
	}
	await db.destroy();
}
main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
