import type { Knex } from 'knex';

/**
 * Seed a sensible default tester_role for every existing item_group based on
 * its name — picks the FIRST role from the standard mapping table
 * (Clinical Laboratory → Medical Technologist, Radiology → Radiologic
 * Technologist, etc.). Only touches rows with a NULL tester_role, so any
 * manual override is preserved.
 */
const DEFAULTS: Array<{ match: RegExp; role: string }> = [
	{ match: /^clinical\s+lab|^laboratory$|^lab$/i,             role: 'Medical Technologist' },
	{ match: /microbio|culture/i,                                role: 'Medical Technologist' },
	{ match: /molecular|pcr/i,                                   role: 'Medical Technologist' },
	{ match: /histopath|cytolog/i,                               role: 'Histotechnologist' },
	{ match: /toxicolog/i,                                       role: 'Medical Technologist' },
	{ match: /nuclear\s+medicine/i,                              role: 'Nuclear Medicine Technologist' },
	{ match: /ultrasound|sonograph/i,                            role: 'Sonographer' },
	{ match: /radiolog|imaging|x-?ray|ct|mri|mammograph/i,       role: 'Radiologic Technologist' },
	{ match: /cardiac|ecg|ekg|echo/i,                            role: 'Cardiovascular Technician' },
	{ match: /neurodiag|eeg|emg/i,                               role: 'Neurodiagnostic Technician' },
	{ match: /pulmonary|pft|respirat/i,                          role: 'Respiratory Therapist' },
	{ match: /endoscop/i,                                        role: 'Endoscopy Nurse' },
];

export async function up(knex: Knex): Promise<void> {
	const rows = await knex('item_groups')
		.whereNull('tester_role')
		.select('uuid', 'name');
	for (const row of rows) {
		const found = DEFAULTS.find((d) => d.match.test(String(row.name || '')));
		if (!found) continue;
		await knex('item_groups')
			.where({ uuid: row.uuid })
			.update({ tester_role: found.role, updated_by: 'migration' });
	}
}

export async function down(_knex: Knex): Promise<void> {
	// No-op — data seed only.
}
