import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLog, AuditAction, AuditActorType, AuditChanges } from './audit-log.model';
import { AuditActor, AuditRequestMeta } from './audit-context';

function parseBool(v: unknown, fallback: boolean): boolean {
	if (v === undefined || v === null || v === '') return fallback;
	const s = String(v).trim().toLowerCase();
	if (s === 'true' || s === '1' || s === 'yes' || s === 'on')  return true;
	if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
	return fallback;
}

export interface AuditEvent {
	tenant_uuid?: string | null;
	actor: AuditActor;
	request?: AuditRequestMeta | null;
	action: AuditAction;
	entity_type?: string | null;
	entity_uuid?: string | null;
	summary?: string | null;
	changes?: AuditChanges | null;
}

/**
 * Knex transaction object (thenable: resolves on commit, rejects on rollback).
 * We only need the `.then` surface here, so a structural type keeps this file
 * free of a direct `knex` import.
 */
export interface TrxLike {
	then(onCommit: () => void, onRollback?: (err: unknown) => void): unknown;
}

/**
 * Writes to `audit_logs` are fire-and-forget: scheduled on the next
 * microtask so they land AFTER the business transaction commits (we never
 * want an audit insert failure to roll back a real operation), and they
 * swallow their own errors (logged but not re-thrown).
 *
 * The service is also exposed as a static singleton via `AuditService.get()`
 * so Objection model lifecycle hooks — which have no Nest DI — can call it.
 */
@Injectable()
export class AuditService {
	private readonly logger = new Logger(AuditService.name);
	private static instance: AuditService | null = null;
	private readonly enabled: boolean;

	constructor(private readonly config?: ConfigService) {
		// Master kill-switch. When false, record() is a no-op — model lifecycle
		// hooks fire but write nothing, and explicit recordAuditEvent() calls
		// from auth become no-ops too. Reads via the controller still work on
		// historical rows regardless of this flag.
		this.enabled = parseBool(this.config?.get('AUDIT_LOG_ENABLED'), true);
		AuditService.instance = this;
		if (!this.enabled) {
			this.logger.warn('AUDIT_LOG_ENABLED=false — audit log writes are disabled.');
		}
	}

	static get(): AuditService | null {
		return AuditService.instance;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Schedule an audit insert. When `trx` is supplied the write is deferred
	 * until the business transaction commits — a rollback discards the audit
	 * event entirely, so audit rows never claim a change that didn't actually
	 * happen. When `trx` is absent (auth events, non-trx service calls), the
	 * write is scheduled on the next microtask and lands on the base pool.
	 */
	record(event: AuditEvent, trx?: TrxLike | null): void {
		if (!this.enabled) return;

		// onReady must never throw: the trx.then chain below passes no third
		// `.catch` handler, so a sync throw here would surface as an unhandled
		// rejection on the derived promise and (under --unhandled-rejections=
		// strict) crash the process. insertRow is async + already .catch()es
		// its own failures, but we belt-and-suspenders the whole body.
		const onReady = () => {
			try {
				this.insertRow(event).catch((err) => {
					this.logger.error(
						`Failed to write audit log (${event.action} ${event.entity_type ?? ''} ${event.entity_uuid ?? ''}): ${err?.message ?? err}`,
					);
				});
			} catch (err: any) {
				this.logger.error(`Audit onReady synchronous failure: ${err?.message ?? err}`);
			}
		};

		if (trx && typeof trx.then === 'function') {
			// Attach to the trx's completion promise. onCommit runs the insert;
			// onRollback discards it. Both branches are no-throw per the guard
			// above, so no trailing .catch is strictly required — but any
			// future refactor of onReady is protected by the try/catch there.
			trx.then(onReady, () => { /* trx rolled back — drop the audit event */ });
			return;
		}

		queueMicrotask(onReady);
	}

	/**
	 * Hard-delete audit rows older than `olderThan` and return the count.
	 * Scheduled nightly by AuditLogCron. Chunked so a single sweep doesn't
	 * acquire a huge lock or balloon the WAL on a very long-neglected table.
	 */
	async pruneOlderThan(olderThan: Date, chunkSize = 10_000): Promise<number> {
		let total = 0;
		for (;;) {
			const deleted = await AuditLog.knex().raw(
				`DELETE FROM audit_logs WHERE uuid IN (
					SELECT uuid FROM audit_logs WHERE created_at < ? ORDER BY created_at ASC LIMIT ?
				)`,
				[olderThan, chunkSize],
			);
			const n = Number(deleted?.rowCount ?? 0);
			total += n;
			if (n < chunkSize) break;
		}
		return total;
	}

	private async insertRow(event: AuditEvent): Promise<void> {
		const row: Partial<AuditLog> = {
			tenant_uuid: event.tenant_uuid ?? event.actor.tenant_uuid ?? null,
			actor_type: event.actor.actor_type,
			actor_uuid: event.actor.actor_uuid,
			actor_label: event.actor.actor_label ? String(event.actor.actor_label).slice(0, 255) : null,
			action: event.action,
			entity_type: event.entity_type ?? null,
			entity_uuid: event.entity_uuid ? String(event.entity_uuid).slice(0, 64) : null,
			summary: event.summary ? String(event.summary).slice(0, 500) : null,
			changes: event.changes ?? null,
			request_ip: event.request?.ip ? String(event.request.ip).slice(0, 64) : null,
			user_agent: event.request?.userAgent ? String(event.request.userAgent).slice(0, 512) : null,
		};
		await AuditLog.query().insert(row as AuditLog);
	}
}

export function recordAuditEvent(event: AuditEvent, trx?: TrxLike | null): void {
	const svc = AuditService.get();
	if (!svc) return;
	svc.record(event, trx ?? null);
}

export type { AuditActorType };
