import { Model } from 'objection';

export class PaymentItem extends Model {
	static tableName = 'payment_items';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	payment_uuid!: string;
	patient_requisition_uuid!: string;
	patient_requisition_item_uuid!: string;

	code!: string;
	name!: string;
	unit_price!: number;
	quantity!: number;
	line_total!: number;
	line_discount_amount!: number;
	line_selling_price!: number;

	package_uuid?: string | null;
	package_code?: string | null;
	package_name?: string | null;

	display_order!: number;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
