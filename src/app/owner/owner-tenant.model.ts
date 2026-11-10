import { Model } from 'objection';

/**
 * Join between owners and tenants. Composite PK (owner_uuid, tenant_uuid)
 * and a UNIQUE on tenant_uuid alone enforce "a tenant has at most one owner".
 */
export class OwnerTenant extends Model {
	static tableName = 'owner_tenants';
	// No single-column PK — Objection still works fine with composite joins
	// as long as we don't lean on findById() for this model.
	static idColumn = ['owner_uuid', 'tenant_uuid'];

	owner_uuid!: string;
	tenant_uuid!: string;
	created_at?: Date;
}
