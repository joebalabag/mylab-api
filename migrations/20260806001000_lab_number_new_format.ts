import type { Knex } from 'knex';

/**
 * Reshape lab_number generation:
 *   old: L-YYYY-NNNNNN            (per-tenant, per-year counter)
 *   new: {CODE}{YY}-{MM}-{NNNNN}  (per-tenant, per-category, per-month counter)
 *
 * 1. Rebuild lab_number_sequences with the new composite key.
 * 2. Renumber existing lab_reports.lab_number rows using ROW_NUMBER() partitioned
 *    by (tenant, category_code, year, month) ordered by created_at, uuid.
 * 3. Seed lab_number_sequences.next_value from MAX(sequence) + 1 per group so
 *    future issues continue where the historical data left off.
 *
 * Missing item_category_code falls back to 'LAB'.
 */
export async function up(knex: Knex): Promise<void> {
	// 1. Rebuild sequences table.
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

	// 2. Renumber existing reports.
	await knex.raw(`
		WITH ranked AS (
			SELECT
				uuid,
				tenant_uuid,
				COALESCE(NULLIF(UPPER(item_category_code), ''), 'LAB') AS code,
				EXTRACT(YEAR  FROM created_at)::int AS yr,
				EXTRACT(MONTH FROM created_at)::int AS mo,
				ROW_NUMBER() OVER (
					PARTITION BY tenant_uuid,
						COALESCE(NULLIF(UPPER(item_category_code), ''), 'LAB'),
						EXTRACT(YEAR FROM created_at),
						EXTRACT(MONTH FROM created_at)
					ORDER BY created_at, uuid
				) AS seq
			FROM lab_reports
		)
		UPDATE lab_reports lr
		SET lab_number = ranked.code
			|| RIGHT(LPAD(ranked.yr::text, 4, '0'), 2)
			|| '-'
			|| LPAD(ranked.mo::text, 2, '0')
			|| '-'
			|| LPAD(ranked.seq::text, 5, '0')
		FROM ranked
		WHERE lr.uuid = ranked.uuid
	`);

	// 3. Seed sequences from the renumbered rows.
	await knex.raw(`
		INSERT INTO lab_number_sequences (tenant_uuid, category_code, year, month, next_value, created_at, updated_at)
		SELECT
			tenant_uuid,
			COALESCE(NULLIF(UPPER(item_category_code), ''), 'LAB') AS category_code,
			EXTRACT(YEAR  FROM created_at)::int AS year,
			EXTRACT(MONTH FROM created_at)::int AS month,
			COUNT(*)::int + 1 AS next_value,
			NOW(),
			NOW()
		FROM lab_reports
		GROUP BY tenant_uuid,
			COALESCE(NULLIF(UPPER(item_category_code), ''), 'LAB'),
			EXTRACT(YEAR FROM created_at),
			EXTRACT(MONTH FROM created_at)
	`);
}

export async function down(knex: Knex): Promise<void> {
	// Non-reversible data change — restore just the old table shape.
	await knex.schema.dropTableIfExists('lab_number_sequences');
	await knex.schema.createTable('lab_number_sequences', (table) => {
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.integer('year').notNullable();
		table.integer('next_value').notNullable().defaultTo(1);
		table.timestamps(true, true);
		table.primary(['tenant_uuid', 'year']);
	});
}
