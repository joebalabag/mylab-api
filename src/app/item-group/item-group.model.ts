import { AuditedModel } from '../audit-log/audited.model';

export class ItemGroup extends AuditedModel {
	static tableName = 'item_groups';
	static idColumn = 'uuid';
	static auditConfig = { entityType: 'item_group', labelField: 'code' };

	uuid!: string;
	tenant_uuid!: string;
	code!: string;
	name!: string;
	description?: string | null;
	signatory_doctor_uuid?: string | null;
	tester_role?: string | null;
	status!: string;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
