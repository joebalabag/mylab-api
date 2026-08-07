import { Model } from 'objection';

// Keep in sync with the DTO validator and the frontend module list.
// 'kds' bundles KDS POS + Kitchen Display — they turn on/off together.
export const PLAN_MODULE_KEYS = ['order_pos', 'terminal_pos', 'kds'] as const;
export type PlanModuleKey = (typeof PLAN_MODULE_KEYS)[number];

export class SubscriptionPlan extends Model {
	static tableName = 'subscription_plans';
	static idColumn = 'uuid';

	static jsonAttributes = ['allowed_modules'];

	uuid!: string;
	code!: string;
	name!: string;
	price!: number;
	days_duration!: number;
	features?: string;
	qrcode_for_payment?: string;
	account_number?: string;
	account_name?: string;
	account_type?: string;
	days_warning_for_near_expiry!: number;
	allowed_modules!: PlanModuleKey[];
	max_terminals?: number | null;
	is_trial!: boolean;
	status!: string;
	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
