import { Model } from 'objection';

export class Tenant extends Model {
	static tableName = 'tenants';
	static idColumn = 'uuid';

	uuid!: string;

	display_name!: string;
	legal_name?: string;
	owner_name?: string | null;
	store_code!: string;
	branch?: string;
	terminal_id?: string;
	currency!: string;
	company_logo?: string;

	address_street1?: string;
	address_street2?: string;
	city?: string;
	province?: string;
	postal_code?: string;
	country?: string;

	contact_number?: string;
	email_address?: string;
	website?: string;

	timezone!: string;

	tin_number?: string;
	is_vat_registered!: boolean;
	show_tin_on_receipt!: boolean;

	receipt_header?: string;
	receipt_footer?: string;
	receipt_show_logo!: boolean;

	// Whole-body receipt overrides. When the corresponding `use_custom_*`
	// flag is true, renderers skip the auto-generated store block and print
	// the custom text as-is. See 20260729000400_tenants_receipt_custom_body.
	receipt_use_custom_header!: boolean;
	receipt_custom_header?: string | null;
	receipt_use_custom_footer!: boolean;
	receipt_custom_footer?: string | null;

	// Lab-report Result Header configuration.
	// mode: 'image' → banner-only using lab_header_image
	//       'logo_text' (default) → company_logo on the left + lab_header_text on the right
	lab_header_mode?: string | null;
	lab_header_image?: string | null;
	lab_header_text?: string | null;

	// Cached from the latest approved subscription payment
	current_subscription_plan_uuid?: string | null;
	current_subscription_days?: number | null;
	current_subscription_start?: Date | null;
	current_subscription_expiry?: Date | null;
	current_subscription_expiry_warning_days?: number | null;
	current_subscription_plan_amount!: number;

	status!: string;
	last_active_at?: Date | null;
	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
