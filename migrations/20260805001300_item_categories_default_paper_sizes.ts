import type { Knex } from 'knex';

/**
 * One-off data fix — align the standard-catalog paper-size defaults with the
 * new "regular short bond" default (US Letter). Chemistry (Clinical
 * Chemistry) is the exception and ships as a half short bond.
 *
 * Only touches rows whose code matches the standard-catalog seed. Rows the
 * user manually created keep their existing setting. Safe to re-run.
 */
export async function up(knex: Knex): Promise<void> {
	await knex('item_categories')
		.whereIn('code', ['HEMA', 'URIN', 'FECA', 'SERO', 'IMMU', 'COAG', 'ENDO'])
		.whereIn('print_paper_size', ['full', 'half'])
		.update({ print_paper_size: 'letter' });

	await knex('item_categories')
		.where({ code: 'CHEM' })
		.whereIn('print_paper_size', ['full', 'half'])
		.update({ print_paper_size: 'half_letter' });
}

export async function down(_knex: Knex): Promise<void> {
	// No-op — data fix only.
}
