import { Model } from 'objection';

export class PendingTenantRegistration extends Model {
	static tableName = 'pending_tenant_registrations';
	static idColumn = 'uuid';

	uuid!: string;
	token!: string;
	expires_at!: Date;

	display_name!: string;
	email_address!: string;
	contact_number?: string | null;
	city?: string | null;
	province?: string | null;
	country?: string | null;

	name!: string;

	timezone?: string | null;

	// Plan the user picked on the register page. Nullable because rows created
	// before this feature don't carry a choice; verify() falls back to any
	// active is_trial plan in that case.
	subscription_plan_uuid?: string | null;

	created_at?: Date;
	updated_at?: Date;
}
