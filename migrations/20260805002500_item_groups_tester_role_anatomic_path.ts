import type { Knex } from 'knex';

/**
 * Follow-up to 20260805002400 — extend the pattern matcher to also cover
 * "Anatomic Pathology" (and any bare "Pathology" group name) since the
 * original regex only matched histopath/cytolog.
 */
const DEFAULTS: Array<{ match: RegExp; role: string }> = [
	{ match: /anatomic\s*path|^pathology$/i, role: 'Histotechnologist' },
];

export async function up(knex: Knex): Promise<void> {
	const rows = await knex('item_groups').whereNull('tester_role').select('uuid', 'name');
	for (const row of rows) {
		const found = DEFAULTS.find((d) => d.match.test(String(row.name || '')));
		if (!found) continue;
		await knex('item_groups')
			.where({ uuid: row.uuid })
			.update({ tester_role: found.role, updated_by: 'migration' });
	}
}

export async function down(_knex: Knex): Promise<void> {
	// No-op.
}
