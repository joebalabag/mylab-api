import { Model } from 'objection';

export class TenantSubscriptionHistory extends Model {
	static tableName = 'tenant_subscription_history';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;

	subscription_plan_uuid?: string | null;
	subscription_plan_code!: string;
	subscription_plan_name!: string;

	subscription_start!: Date;
	subscription_end!: Date;
	subscription_days!: number;
	expiry_warning_days!: number;
	subscription_plan_amount!: number;

	status!: string;

	activated_by_payment_uuid?: string | null;
	alter_reason?: string | null;
	created_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
