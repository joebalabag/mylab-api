import { AuditedModel } from '../audit-log/audited.model';

export class ItemCategory extends AuditedModel {
	static tableName = 'item_categories';
	static idColumn = 'uuid';
	static auditConfig = { entityType: 'item_category', labelField: 'code' };

	uuid!: string;
	tenant_uuid!: string;
	item_group_uuid!: string;
	code!: string;
	name!: string;
	description?: string | null;
	combine_printout!: boolean;
	color?: string | null;
	print_title?: string | null;
	print_template?: string | null;
	print_paper_size?: string | null;
	status!: string;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
