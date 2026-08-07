import type { Knex } from 'knex';

/**
 * Correction to 20260806001000 — the sequence key should be the item GROUP
 * code (e.g. LAB), not the item category code (e.g. CHEM). Rebuild the
 * sequence table with `group_code` and renumber lab_reports.lab_number
 * using JOIN item_categories → item_groups.
 *
 * Falls back to 'LAB' when a report has no category or the category has
 * no group (defensive — shouldn't occur in normal data).
 */
export async function up(knex: Knex): Promise<void> {
	// 1. Rebuild sequences table around group_code.
	await knex.schema.dropTableIfExists('lab_number_sequences');
	await knex.schema.createTable('lab_number_sequences', (table) => {
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('group_code', 32).notNullable();
		table.integer('year').notNullable();
		table.integer('month').notNullable();
		table.integer('next_value').notNullable().defaultTo(1);
		table.timestamps(true, true);
		table.primary(['tenant_uuid', 'group_code', 'year', 'month']);
	});

	// 2. Renumber existing lab_reports by joining category → group.
	await knex.raw(`
		WITH resolved AS (
			SELECT
				lr.uuid,
				lr.tenant_uuid,
				COALESCE(NULLIF(UPPER(ig.code), ''), 'LAB') AS grp_code,
				EXTRACT(YEAR  FROM lr.created_at)::int AS yr,
				EXTRACT(MONTH FROM lr.created_at)::int AS mo,
				lr.created_at
			FROM lab_reports lr
			LEFT JOIN item_categories ic ON ic.uuid = lr.item_category_uuid
			LEFT JOIN item_groups     ig ON ig.uuid = ic.item_group_uuid
		),
		ranked AS (
			SELECT
				uuid,
				grp_code,
				yr,
				mo,
				ROW_NUMBER() OVER (
					PARTITION BY tenant_uuid, grp_code, yr, mo
					ORDER BY created_at, uuid
				) AS seq
			FROM resolved
		)
		UPDATE lab_reports lr
		SET lab_number = ranked.grp_code
			|| RIGHT(LPAD(ranked.yr::text, 4, '0'), 2)
			|| '-'
			|| LPAD(ranked.mo::text, 2, '0')
			|| '-'
			|| LPAD(ranked.seq::text, 5, '0')
		FROM ranked
		WHERE lr.uuid = ranked.uuid
	`);

	// 3. Seed sequences from renumbered rows.
	await knex.raw(`
		INSERT INTO lab_number_sequences (tenant_uuid, group_code, year, month, next_value, created_at, updated_at)
		SELECT
			lr.tenant_uuid,
			COALESCE(NULLIF(UPPER(ig.code), ''), 'LAB') AS group_code,
			EXTRACT(YEAR  FROM lr.created_at)::int AS year,
			EXTRACT(MONTH FROM lr.created_at)::int AS month,
			COUNT(*)::int + 1 AS next_value,
			NOW(),
			NOW()
		FROM lab_reports lr
		LEFT JOIN item_categories ic ON ic.uuid = lr.item_category_uuid
		LEFT JOIN item_groups     ig ON ig.uuid = ic.item_group_uuid
		GROUP BY lr.tenant_uuid,
			COALESCE(NULLIF(UPPER(ig.code), ''), 'LAB'),
			EXTRACT(YEAR FROM lr.created_at),
			EXTRACT(MONTH FROM lr.created_at)
	`);
}

export async function down(knex: Knex): Promise<void> {
	// Revert to the category_code shape from 20260806001000.
	await knex.schema.dropTableIfExists('lab_number_sequences');
	await knex.schema.createTable('lab_number_sequences', (table) => {
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('category_code', 32).notNullable();
		table.integer('year').notNullable();
		table.integer('month').notNullable();
		table.integer('next_value').notNullable().defaultTo(1);
		table.timestamps(true, true);
		table.primary(['tenant_uuid', 'category_code', 'year', 'month']);
	});
}
