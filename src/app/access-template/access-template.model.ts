import { AuditedModel } from '../audit-log/audited.model';

export class AccessTemplate extends AuditedModel {
	static tableName = 'access_templates';
	static idColumn = 'uuid';
	static auditConfig = {
		entityType: 'access_template',
		labelField: 'main_navigation',
		tenantField: null as string | null,
	};

	uuid!: string;
	navigation_id!: number;
	catalog_id!: number;
	catalog!: string;
	main_navigation!: string;
	sub_navigation!: string;
	has_access!: boolean;
	remarks?: string | null;
	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
