import { AuditedModel } from '../audit-log/audited.model';

export class ItemPackage extends AuditedModel {
	static tableName = 'item_packages';
	static idColumn = 'uuid';
	static auditConfig = { entityType: 'item_package', labelField: 'code' };

	uuid!: string;
	tenant_uuid!: string;
	code!: string;
	name!: string;
	description?: string | null;
	package_price!: number;
	status!: string;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
