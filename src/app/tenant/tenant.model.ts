import { Model, Pojo } from 'objection';

export class Tenant extends Model {
	static tableName = 'tenants';
	static idColumn = 'uuid';

	// Strip the encrypted SMTP password from every serialized response —
	// the ciphertext is only useful server-side. Emit a boolean flag so the
	// UI can tell whether a password is on file without ever seeing it.
	$formatJson(json: Pojo): Pojo {
		const out = super.$formatJson(json);
		if (Object.prototype.hasOwnProperty.call(out, 'smtp_password_enc')) {
			out.smtp_password_set = !!out.smtp_password_enc;
			delete out.smtp_password_enc;
		} else {
			out.smtp_password_set = false;
		}
		return out;
	}

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

	// Number of tester signatories printed on a lab report (1 or 2). See
	// migration 20260809000100 for the full behavior. Column is
	// NOT NULL DEFAULT 1 in the DB so this is safe to treat as required.
	tester_signatory_count!: number;

	// When true, tapping Tag as Final auto-emails the finalized PDF to
	// the patient. When false, the send is deferred to a manual click of
	// the Resend button in Print Preview. NOT NULL DEFAULT true in DB.
	auto_email_result_on_finalize!: boolean;

	// Per-tenant SMTP override for lab-result emails. When smtp_use_own is
	// false the mailer falls back to the platform SMTP_* env vars. Password
	// is AES-256-GCM ciphertext (see aes.util.ts) — never round-trip the
	// plaintext back to the client.
	smtp_use_own!: boolean;
	smtp_host?: string | null;
	smtp_port?: number | null;
	smtp_secure!: boolean;
	smtp_user?: string | null;
	smtp_password_enc?: string | null;

	// Cached from the latest approved subscription payment
	current_subscription_plan_uuid?: string | null;
	current_subscription_days?: number | null;
	current_subscription_start?: Date | null;
	current_subscription_expiry?: Date | null;
	current_subscription_expiry_warning_days?: number | null;
	current_subscription_plan_amount!: number;

	// Tenant-level dark-launch gate for offline mode. See migration
	// 20260902000100. Default false — tenant must opt in from Settings.
	offline_mode_enabled!: boolean;

	status!: string;
	last_active_at?: Date | null;
	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
