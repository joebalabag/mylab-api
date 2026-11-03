import { AuditedModel } from '../audit-log/audited.model';

export type DiscountType = 'percent' | 'fix' | 'open_amount';

export class Discount extends AuditedModel {
	static tableName = 'discounts';
	static idColumn = 'uuid';
	static auditConfig = { entityType: 'discount', labelField: 'code' };

	uuid!: string;
	tenant_uuid!: string;
	code!: string;
	name!: string;
	discount_type!: DiscountType;
	value!: number;
	status!: string;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
