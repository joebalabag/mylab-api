import type { Knex } from 'knex';

/**
 * Extends offline mode to cover the middle of the patient transaction
 * journey: requisitions (adding tests to a case). Same columns as the
 * initial four tables added in 20260902000100.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('patient_requisitions', (t) => {
		t.string('client_uuid').nullable();
		t.timestamp('created_offline_at', { useTz: true }).nullable();
	});
	await knex.raw(`
		CREATE UNIQUE INDEX IF NOT EXISTS patient_requisitions_tenant_client_uuid_uidx
		ON patient_requisitions (tenant_uuid, client_uuid)
		WHERE client_uuid IS NOT NULL
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.raw(`DROP INDEX IF EXISTS patient_requisitions_tenant_client_uuid_uidx`);
	await knex.schema.alterTable('patient_requisitions', (t) => {
		t.dropColumn('created_offline_at');
		t.dropColumn('client_uuid');
	});
}
