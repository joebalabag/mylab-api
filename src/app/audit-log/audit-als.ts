import { AsyncLocalStorage } from 'node:async_hooks';
import { AuditActor, AuditRequestMeta, SYSTEM_ACTOR } from './audit-context';

export interface AuditStore {
	actor: AuditActor;
	request: AuditRequestMeta | null;
}

const als = new AsyncLocalStorage<AuditStore>();

export function runWithAuditStore<T>(store: AuditStore, fn: () => T): T {
	return als.run(store, fn);
}

export function getAuditStore(): AuditStore | undefined {
	return als.getStore();
}

/**
 * Resolve the active audit actor for the current async context. Falls back to
 * SYSTEM_ACTOR when no request wrapped the current code path (schedulers,
 * seeders, boot-time hooks).
 */
export function resolveActor(): AuditActor {
	return als.getStore()?.actor ?? SYSTEM_ACTOR;
}

export function resolveRequest(): AuditRequestMeta | null {
	return als.getStore()?.request ?? null;
}
