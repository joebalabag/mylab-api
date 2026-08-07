import { Model } from 'objection';

export type DiscountType = 'percent' | 'fix' | 'open_amount';

export class Discount extends Model {
	static tableName = 'discounts';
	static idColumn = 'uuid';

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
