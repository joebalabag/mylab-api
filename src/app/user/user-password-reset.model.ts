import { Model } from 'objection';

/**
 * One row per forgot-password request. See migration
 * 20260810000100_user_password_resets.ts for the schema rationale and TTL.
 */
export class UserPasswordReset extends Model {
	static tableName = 'user_password_resets';
	static idColumn = 'uuid';

	uuid!: string;
	user_uuid!: string;
	token!: string;
	expires_at!: Date;
	used_at?: Date | null;
	requested_ip?: string | null;
	requested_user_agent?: string | null;
	created_at?: Date;
	updated_at?: Date;
}
