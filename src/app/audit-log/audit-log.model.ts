import { Model } from 'objection';

export type AuditActorType = 'user' | 'admin' | 'system' | 'anonymous';

export type AuditAction =
	| 'create'
	| 'update'
	| 'delete'
	| 'login'
	| 'login_failed'
	| 'logout'
	| 'password_reset_request'
	| 'password_reset_complete';

export interface AuditChangesCreate {
	after: Record<string, any>;
}
export interface AuditChangesUpdate {
	diff: Record<string, { from: any; to: any }>;
}
export interface AuditChangesDelete {
	before: Record<string, any>;
}
export type AuditChanges = AuditChangesCreate | AuditChangesUpdate | AuditChangesDelete | Record<string, any>;

export class AuditLog extends Model {
	static tableName = 'audit_logs';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid?: string | null;

	actor_type!: AuditActorType;
	actor_uuid?: string | null;
	actor_label?: string | null;

	action!: AuditAction;

	entity_type?: string | null;
	entity_uuid?: string | null;

	summary?: string | null;
	changes?: AuditChanges | null;

	request_ip?: string | null;
	user_agent?: string | null;

	created_at?: Date;

	static jsonAttributes = ['changes'];
}
