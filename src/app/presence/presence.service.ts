import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

export interface PresenceEntry {
	uuid: string;
	username: string;
	name: string;
	tenant_uuid?: string;
	role: string;
	type: 'admin' | 'user';
	last_seen_at: number;
}

/**
 * In-memory presence tracker for the super-admin "who's online" panel.
 *
 * Design notes:
 *   • Zero DB writes — every authenticated request bumps a Map keyed by
 *     user_uuid, which is O(1) and imperceptible next to the actual query.
 *   • The Map is bounded to actually-active users by a periodic sweep. At
 *     ~400 bytes/entry, 10k concurrent users ≈ 4 MB — a rounding error for
 *     the Nest process (~150-300 MB baseline).
 *   • Presence is intentionally non-durable — it resets on API restart.
 *     "Currently online" is a live-only concept; a persisted last_seen_at
 *     is a separate feature that would need a DB column and interceptor
 *     write coalescing.
 *   • PM2 cluster mode caveat: each worker owns its own Map, so the super
 *     admin sees only the fraction of users whose request landed on the
 *     worker serving the /active-users call. Fine for a monitoring panel;
 *     if that ever matters, promote to Redis / a shared store.
 */
@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
	private readonly entries = new Map<string, PresenceEntry>();
	private sweepTimer: NodeJS.Timeout | null = null;

	// 2 min == 4× the FE heartbeat cadence, so we tolerate a couple of
	// dropped pings before a user drops off the active list.
	static readonly ACTIVE_WINDOW_MS = 2 * 60_000;
	static readonly SWEEP_INTERVAL_MS = 60_000;

	onModuleInit(): void {
		this.sweepTimer = setInterval(() => this.sweep(), PresenceService.SWEEP_INTERVAL_MS);
		this.sweepTimer.unref?.();
	}

	onModuleDestroy(): void {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer);
			this.sweepTimer = null;
		}
	}

	touch(user: {
		uuid?: string;
		username?: string;
		name?: string;
		tenant_uuid?: string;
		role?: string;
		type?: 'admin' | 'user';
	}): void {
		if (!user?.uuid) return;
		this.entries.set(user.uuid, {
			uuid: user.uuid,
			username: user.username ?? '',
			name: user.name ?? '',
			tenant_uuid: user.tenant_uuid,
			role: user.role ?? '',
			type: user.type ?? 'user',
			last_seen_at: Date.now(),
		});
	}

	forget(uuid: string): void {
		this.entries.delete(uuid);
	}

	list(opts: { sinceMs?: number; type?: 'admin' | 'user' } = {}): PresenceEntry[] {
		const cutoff = Date.now() - (opts.sinceMs ?? PresenceService.ACTIVE_WINDOW_MS);
		const out: PresenceEntry[] = [];
		for (const e of this.entries.values()) {
			if (e.last_seen_at < cutoff) continue;
			if (opts.type && e.type !== opts.type) continue;
			out.push(e);
		}
		return out;
	}

	private sweep(): void {
		const cutoff = Date.now() - PresenceService.ACTIVE_WINDOW_MS;
		for (const [uuid, e] of this.entries) {
			if (e.last_seen_at < cutoff) this.entries.delete(uuid);
		}
	}
}
