import type { Knex } from 'knex';

/**
 * Widen item_categories.print_paper_size from varchar(20) to varchar(40) so
 * the longest current value ("half_letter_crosswise", 21 chars) fits along
 * with any near-future additions.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.raw(`ALTER TABLE item_categories ALTER COLUMN print_paper_size TYPE varchar(40)`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.raw(`ALTER TABLE item_categories ALTER COLUMN print_paper_size TYPE varchar(20)`);
}
