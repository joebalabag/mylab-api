import type { Knex } from 'knex';

/**
 * Many-to-one join between owners and tenants modeled as a separate table.
 * A tenant is owned by at most one owner (enforced by UNIQUE on tenant_uuid)
 * — an owner can own many tenants. Modeling as a join keeps `tenants` lean
 * (no FK column proliferation) and makes reassignment a single DELETE +
 * INSERT.
 *
 * Deleting an owner cascades: the join rows go away and the tenants become
 * unassigned. Deleting a tenant cascades: the join row goes away but the
 * owner remains.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('owner_tenants', (table) => {
		table.string('owner_uuid').notNullable();
		table.string('tenant_uuid').notNullable();
		table.timestamp('created_at').defaultTo(knex.fn.now());

		table.primary(['owner_uuid', 'tenant_uuid']);
		// One tenant → at most one owner. Enforced at the DB layer so a race
		// between two /assign-tenant calls can't produce dual ownership.
		table.unique(['tenant_uuid']);

		table
			.foreign('owner_uuid')
			.references('uuid')
			.inTable('owners')
			.onDelete('CASCADE');
		table
			.foreign('tenant_uuid')
			.references('uuid')
			.inTable('tenants')
			.onDelete('CASCADE');

		table.index(['owner_uuid']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('owner_tenants');
}
