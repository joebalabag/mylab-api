import type { Knex } from 'knex';

/**
 * The audit-log access row shipped with catalog='administration'; the User
 * Access UI groups rows by that catalog label, and the convention elsewhere
 * in the system is the adjective form. Rename to 'administrative' in both
 * access_templates (the master list) and user_accesses (per-user grants) so
 * the "Administrative" bucket in Assign Access contains the Audit Log row.
 *
 * Idempotent — the where-clauses pin to main_navigation='audit log', so a
 * re-run on an already-renamed DB is a no-op.
 */
export async function up(knex: Knex): Promise<void> {
	await knex('access_templates')
		.where({ main_navigation: 'audit log', catalog: 'administration' })
		.update({ catalog: 'administrative' });

	await knex('user_accesses')
		.where({ main_navigation: 'audit log', catalog: 'administration' })
		.update({ catalog: 'administrative' });
}

export async function down(knex: Knex): Promise<void> {
	await knex('access_templates')
		.where({ main_navigation: 'audit log', catalog: 'administrative' })
		.update({ catalog: 'administration' });

	await knex('user_accesses')
		.where({ main_navigation: 'audit log', catalog: 'administrative' })
		.update({ catalog: 'administration' });
}
