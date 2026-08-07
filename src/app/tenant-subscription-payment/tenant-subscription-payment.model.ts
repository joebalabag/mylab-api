import { Model } from 'objection';

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export class TenantSubscriptionPayment extends Model {
	static tableName = 'tenant_subscription_payments';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;

	subscription_plan_uuid!: string;
	subscription_plan_code!: string;
	subscription_plan_name!: string;
	subscription_days!: number;
	subscription_plan_amount!: number;
	amount_paid?: number | null;

	payment_status!: PaymentStatus;

	payment_reference_number?: string | null;
	payee_account_number?: string | null;
	payment_method?: string | null;
	payment_method_name?: string | null;
	payment_datetime?: Date | null;

	payment_approved_by_uuid?: string | null;
	payment_approved_by_name?: string | null;
	payment_approved_datetime?: Date | null;

	payment_rejected_by_uuid?: string | null;
	payment_rejected_by_name?: string | null;
	payment_rejected_datetime?: Date | null;
	rejection_reason?: string | null;

	payment_attachment_file?: string | null;

	paypal_order_id?: string | null;
	paypal_capture_id?: string | null;

	ai_extraction?: any;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
