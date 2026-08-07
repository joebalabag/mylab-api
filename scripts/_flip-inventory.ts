import knex from 'knex';
import config from '../knexfile';

async function main() {
	const db = knex(config);
	try {
		await db.transaction(async (trx) => {
			// Pick 15 random products to keep as is_inventory=true.
			const kept = await trx('products')
				.select('uuid', 'name')
				.orderByRaw('random()')
				.limit(15);
			const keptUuids = kept.map((r) => r.uuid);

			const flipped = await trx('products')
				.whereNotIn('uuid', keptUuids)
				.update({
					is_inventory: false,
					stock: 0,
					low_stock_level: 0,
					reorder_level: 0,
				});

			console.log(`Kept as is_inventory=true (15): ${keptUuids.length}`);
			for (const r of kept) console.log(`  - ${r.uuid}  ${r.name}`);
			console.log(`Flipped to is_inventory=false: ${flipped}`);
		});

		// Sanity check.
		const total = await db('products').count<{ n: string }[]>('* as n');
		const inv = await db('products').where({ is_inventory: true }).count<{ n: string }[]>('* as n');
		const notInv = await db('products').where({ is_inventory: false }).count<{ n: string }[]>('* as n');
		console.log('---');
		console.log(`total: ${total[0].n}`);
		console.log(`is_inventory=true: ${inv[0].n}`);
		console.log(`is_inventory=false: ${notInv[0].n}`);
	} finally {
		await db.destroy();
	}
}
main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
