import knex from 'knex';
import config from '../knexfile';

async function main() {
	const db = knex(config);
	const total = await db('products').count<{ n: string }[]>('* as n');
	const inv = await db('products').where({ is_inventory: true }).count<{ n: string }[]>('* as n');
	const notInv = await db('products').where({ is_inventory: false }).count<{ n: string }[]>('* as n');
	console.log(`total: ${total[0].n}`);
	console.log(`is_inventory=true: ${inv[0].n}`);
	console.log(`is_inventory=false: ${notInv[0].n}`);
	await db.destroy();
}
main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
