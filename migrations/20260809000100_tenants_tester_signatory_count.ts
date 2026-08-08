import type { Knex } from 'knex';

/**
 * Per-tenant setting for how many tester signatories print on a lab
 * report (medtech / radtech / etc — the LEFT signature column).
 *
 *   1  → single signature; whoever taps "Tag as Final" is stamped as
 *        medtech_* at finalize time (createBatch leaves medtech_* null).
 *   2  → two signatures; the creator is stamped as medtech_* at
 *        createBatch (existing behavior), and Tag as Final requires a
 *        credential ceremony to fill medtech2_*. When the resolved
 *        credential belongs to the same person as slot 1 the report
 *        collapses back to a single printed signature (medtech2_* stays
 *        null).
 *
 * Default = 1 so existing tenants get the simpler flow unless they
 * explicitly opt in. The pathologist signatory (right column) is
 * unaffected by this setting.
 */
export async function up(knex: Knex): Promise<void> {
	const has = await knex.schema.hasColumn('tenants', 'tester_signatory_count');
	if (!has) {
		await knex.schema.alterTable('tenants', (table) => {
			table.integer('tester_signatory_count').notNullable().defaultTo(1);
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('tester_signatory_count');
	});
}
