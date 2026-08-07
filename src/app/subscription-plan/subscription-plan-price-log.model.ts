import { Model } from 'objection';

export type SubscriptionPlanPriceLogSource = 'create' | 'edit';

export class SubscriptionPlanPriceLog extends Model {
	static tableName = 'subscription_plan_price_logs';
	static idColumn = 'uuid';

	uuid!: string;
	subscription_plan_uuid!: string;

	old_price?: number | null;
	new_price!: number;

	source!: SubscriptionPlanPriceLogSource;
	changed_by?: string | null;
	changed_at?: Date;
}
