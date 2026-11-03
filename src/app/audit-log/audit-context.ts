import { AuditActorType } from './audit-log.model';

/**
 * The `current` object produced by the JWT strategy (`request.user`) is
 * untyped (controllers routinely treat it as `any`). This helper narrows it
 * into the shape the audit layer needs and derives an actor_type.
 */
export interface AuditActor {
	actor_type: AuditActorType;
	actor_uuid: string | null;
	actor_label: string | null;
	tenant_uuid: string | null;
}

export interface AuditRequestMeta {
	ip: string | null;
	userAgent: string | null;
}

export interface AuditQueryContext {
	auditActor?: AuditActor;
	auditRequest?: AuditRequestMeta;
	/** Set when a controller/service explicitly disables audit for a specific query (bulk backfills, etc.). */
	auditSkip?: boolean;
}

export function actorFromCurrent(current: any): AuditActor {
	if (!current) {
		return { actor_type: 'anonymous', actor_uuid: null, actor_label: null, tenant_uuid: null };
	}
	const actor_type: AuditActorType =
		current.type === 'admin' ? 'admin' : current.type === 'user' ? 'user' : 'anonymous';
	return {
		actor_type,
		actor_uuid: current.uuid ?? null,
		actor_label: current.name || current.username || null,
		tenant_uuid: current.tenant_uuid ?? null,
	};
}

/**
 * Spread into Objection's `.context({...})` so model hooks downstream can read
 * who the acting user is and what request they came in on:
 *
 *   Payment.query().context(withAuditContext(current, req)).insert({...})
 */
export function withAuditContext(current: any, req?: AuditRequestMeta | null): AuditQueryContext {
	return {
		auditActor: actorFromCurrent(current),
		auditRequest: req ?? { ip: null, userAgent: null },
	};
}

export const SYSTEM_ACTOR: AuditActor = {
	actor_type: 'system',
	actor_uuid: null,
	actor_label: 'system',
	tenant_uuid: null,
};
