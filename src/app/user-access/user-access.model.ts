import { AuditedModel } from '../audit-log/audited.model';

export class UserAccess extends AuditedModel {
	static tableName = 'user_accesses';
	static idColumn = 'uuid';
	static auditConfig = { entityType: 'user_access', labelField: 'main_navigation' };

	uuid!: string;
	tenant_uuid!: string;
	user_uuid!: string;

	navigation_id!: number;
	catalog_id!: number;
	catalog!: string;
	main_navigation!: string;
	sub_navigation!: string;

	remarks?: string | null;
	has_access!: boolean;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
