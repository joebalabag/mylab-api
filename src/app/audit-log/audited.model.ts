import { Model, ModelOptions, QueryContext } from 'objection';
import { AuditService, recordAuditEvent, TrxLike } from './audit-log.service';
import { AuditQueryContext } from './audit-context';
import { resolveActor, resolveRequest } from './audit-als';

/** Cheap short-circuit for the hooks — avoids computing diffs when logging is globally off. */
function auditDisabled(): boolean {
	const svc = AuditService.get();
	return !!svc && !svc.isEnabled();
}

/**
 * If this instance was fetched/built inside an Objection transaction,
 * `instance.$knex()` returns the trx (which is thenable — resolves on commit,
 * rejects on rollback). Otherwise it returns the base pool, which is reference-
 * equal to the ModelClass's base knex. We detect by inequality so we don't
 * mis-schedule non-trx events onto a thenable that never settles.
 */
function detectTrx(instance: Model): TrxLike | null {
	const ctx: any = (instance as any).$knex?.();
	const base: any = (instance.constructor as any).knex?.();
	if (ctx && base && ctx !== base && typeof ctx.then === 'function') return ctx as TrxLike;
	return null;
}

export interface AuditConfig {
	/** Logical entity name used in `audit_logs.entity_type`. */
	entityType: string;
	/** Property to use as actor-facing label in summary strings (name > display_name > code > uuid). */
	labelField?: string;
	/** Fields to strip from change payloads AND from no-op detection. updated_at is always ignored. */
	ignoreFields?: string[];
	/** Columns that should never leak into audit payloads (password hashes, tokens, etc.). */
	redactFields?: string[];
	/** Property holding tenant scope; defaults to `tenant_uuid`. Set to null for global entities (admin, tenant, subscription_plan). */
	tenantField?: string | null;
}

const ALWAYS_IGNORE = new Set(['updated_at', 'created_at']);
const ALWAYS_REDACT = new Set(['passphrase', 'password', 'password_hash', 'keycode', 'token']);

function sanitize(row: Record<string, any> | undefined | null, cfg: AuditConfig): Record<string, any> {
	if (!row) return {};
	const out: Record<string, any> = {};
	const redact = new Set<string>([...(cfg.redactFields || []), ...ALWAYS_REDACT]);
	for (const key of Object.keys(row)) {
		if (redact.has(key)) continue;
		out[key] = (row as any)[key];
	}
	return out;
}

function computeDiff(
	before: Record<string, any>,
	after: Record<string, any>,
	cfg: AuditConfig,
): Record<string, { from: any; to: any }> {
	const diff: Record<string, { from: any; to: any }> = {};
	const ignore = new Set<string>([...(cfg.ignoreFields || []), ...ALWAYS_IGNORE]);
	const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
	for (const k of keys) {
		if (ignore.has(k)) continue;
		if (ALWAYS_REDACT.has(k)) continue;
		const a = before[k];
		const b = after[k];
		if (!equalish(a, b)) diff[k] = { from: a ?? null, to: b ?? null };
	}
	return diff;
}

function equalish(a: any, b: any): boolean {
	if (a === b) return true;
	if (a == null && b == null) return true;
	if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
	if (a instanceof Date && typeof b === 'string') return new Date(b).getTime() === a.getTime();
	if (b instanceof Date && typeof a === 'string') return new Date(a).getTime() === b.getTime();
	if (typeof a === 'object' && typeof b === 'object') {
		try {
			return JSON.stringify(a) === JSON.stringify(b);
		} catch {
			return false;
		}
	}
	// Loose compare — DB returns strings for decimals, JS has numbers, "0" vs 0 should not look like a change.
	// eslint-disable-next-line eqeqeq
	return String(a) == String(b);
}

/**
 * Objection Model base class that emits create / update / delete audit events
 * on every lifecycle hook. Subclasses declare `static auditConfig: AuditConfig`
 * and services pass actor info via `.context(withAuditContext(current, req))`.
 *
 * See the module README for the required `.patchAndFetch` convention — bare
 * `.patch(...).where(...)` queries do not fire the hooks and will skip audit.
 */
export abstract class AuditedModel extends Model {
	static auditConfig: AuditConfig = { entityType: 'unknown' };

	private _audit_label(): string | null {
		const cfg = (this.constructor as typeof AuditedModel).auditConfig;
		const field = cfg.labelField;
		if (field && (this as any)[field]) return String((this as any)[field]);
		if ((this as any).name) return String((this as any).name);
		if ((this as any).display_name) return String((this as any).display_name);
		if ((this as any).code) return String((this as any).code);
		return null;
	}

	private _audit_tenant_uuid(): string | null {
		const cfg = (this.constructor as typeof AuditedModel).auditConfig;
		if (cfg.tenantField === null) return null;
		const field = cfg.tenantField || 'tenant_uuid';
		return ((this as any)[field] as string | undefined) ?? null;
	}

	private _audit_entity_uuid(): string | null {
		const idCol = (this.constructor as typeof AuditedModel).idColumn as string;
		return ((this as any)[idCol] as string | undefined) ?? null;
	}

	async $afterInsert(qc: QueryContext): Promise<void> {
		await super.$afterInsert(qc);
		if (auditDisabled()) return;
		const audit = (qc as AuditQueryContext) || {};
		if (audit.auditSkip) return;
		const cfg = (this.constructor as typeof AuditedModel).auditConfig;
		const after = sanitize({ ...(this as any) }, cfg);
		recordAuditEvent({
			tenant_uuid: this._audit_tenant_uuid(),
			actor: audit.auditActor ?? resolveActor(),
			request: audit.auditRequest ?? resolveRequest(),
			action: 'create',
			entity_type: cfg.entityType,
			entity_uuid: this._audit_entity_uuid(),
			summary: `Created ${cfg.entityType}${this._audit_label() ? ` "${this._audit_label()}"` : ''}`,
			changes: { after },
		}, detectTrx(this));
	}

	async $beforeUpdate(opt: ModelOptions, qc: QueryContext): Promise<void> {
		await super.$beforeUpdate(opt, qc);
		if (auditDisabled()) return;
		const audit = (qc as AuditQueryContext) || {};
		if (audit.auditSkip) return;
		// opt.old is populated when the update is instance-based or when the
		// row was pre-fetched (patchAndFetch, updateAndFetchById). For bare
		// Model.query().patch(...).where(...) it will be undefined — the hook
		// still fires once, but we can't produce a meaningful diff.
		(qc as any).__audit_old = opt?.old ? { ...(opt.old as any) } : null;
	}

	async $afterUpdate(opt: ModelOptions, qc: QueryContext): Promise<void> {
		await super.$afterUpdate(opt, qc);
		if (auditDisabled()) return;
		const audit = (qc as AuditQueryContext) || {};
		if (audit.auditSkip) return;
		const cfg = (this.constructor as typeof AuditedModel).auditConfig;
		const before = (qc as any).__audit_old as Record<string, any> | null;
		const after = { ...(this as any) };
		// If this.$id() is missing (bulk patch), we can still log a generic
		// "something updated" event — but with no entity_uuid it's noise.
		if (!this._audit_entity_uuid()) return;
		const diff = before ? computeDiff(sanitize(before, cfg), sanitize(after, cfg), cfg) : {};
		if (before && Object.keys(diff).length === 0) return; // true no-op, don't log
		recordAuditEvent({
			tenant_uuid: this._audit_tenant_uuid(),
			actor: audit.auditActor ?? resolveActor(),
			request: audit.auditRequest ?? resolveRequest(),
			action: 'update',
			entity_type: cfg.entityType,
			entity_uuid: this._audit_entity_uuid(),
			summary: `Updated ${cfg.entityType}${this._audit_label() ? ` "${this._audit_label()}"` : ''}`,
			changes: before ? { diff } : { patch: sanitize(after, cfg) },
		}, detectTrx(this));
	}

	async $beforeDelete(qc: QueryContext): Promise<void> {
		await super.$beforeDelete(qc);
		if (auditDisabled()) return;
		const audit = (qc as AuditQueryContext) || {};
		if (audit.auditSkip) return;
		(qc as any).__audit_deleted = { ...(this as any) };
	}

	async $afterDelete(qc: QueryContext): Promise<void> {
		await super.$afterDelete(qc);
		if (auditDisabled()) return;
		const audit = (qc as AuditQueryContext) || {};
		if (audit.auditSkip) return;
		const cfg = (this.constructor as typeof AuditedModel).auditConfig;
		const before = ((qc as any).__audit_deleted as Record<string, any> | undefined) ?? { ...(this as any) };
		recordAuditEvent({
			tenant_uuid: this._audit_tenant_uuid() || (before.tenant_uuid as string | undefined) || null,
			actor: audit.auditActor ?? resolveActor(),
			request: audit.auditRequest ?? resolveRequest(),
			action: 'delete',
			entity_type: cfg.entityType,
			entity_uuid: this._audit_entity_uuid() || (before[(this.constructor as typeof AuditedModel).idColumn as string] as string) || null,
			summary: `Deleted ${cfg.entityType}${this._audit_label() ? ` "${this._audit_label()}"` : ''}`,
			changes: { before: sanitize(before, cfg) },
		}, detectTrx(this));
	}
}
