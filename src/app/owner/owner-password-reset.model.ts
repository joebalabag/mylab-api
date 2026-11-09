import { Model } from 'objection';

/**
 * One row per owner forgot-password request. See migration
 * 20261109000300_create_owner_password_resets.ts for the schema rationale
 * and TTL. Mirrors UserPasswordReset but keyed to owners.
 */
export class OwnerPasswordReset extends Model {
	static tableName = 'owner_password_resets';
	static idColumn = 'uuid';

	uuid!: string;
	owner_uuid!: string;
	token!: string;
	expires_at!: Date;
	used_at?: Date | null;
	requested_ip?: string | null;
	requested_user_agent?: string | null;
	created_at?: Date;
	updated_at?: Date;
}
