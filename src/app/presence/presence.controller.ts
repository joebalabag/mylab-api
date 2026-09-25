import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiResponseHelper } from '@/common/helpers/response.helper';

import { PresenceService } from './presence.service';
import { extractClientIp, extractUserAgent } from './request-meta';
import { Tenant } from '../tenant/tenant.model';

@ApiTags('Presence')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('presence')
export class PresenceController {
	constructor(private readonly presence: PresenceService) {}

	@Post('/heartbeat')
	@ApiOperation({
		summary:
			"Bump the caller's last-seen timestamp in the in-memory presence map. Called by the frontend every ~30s per open tab so idle sessions stay visible in the super-admin active-users panel.",
	})
	heartbeat(@Req() req: Request, @Res() res: Response, @CurrentUser() user: any) {
		this.presence.touch({
			uuid: user?.uuid,
			username: user?.username,
			name: user?.name,
			tenant_uuid: user?.tenant_uuid,
			role: user?.role,
			type: user?.type,
			ip: extractClientIp(req),
			user_agent: extractUserAgent(req),
		});
		return ApiResponseHelper.sendResponse(res, { ok: true, at: new Date().toISOString() });
	}

	@Post('/forget')
	@ApiOperation({
		summary:
			"Remove the caller from the in-memory presence map. Called by the frontend on explicit logout and on tab/browser close (via navigator.sendBeacon / keepalive fetch), so users disappear from the super-admin panel immediately instead of waiting for the passive 2-min age-out.",
	})
	forget(@Res() res: Response, @CurrentUser() user: any) {
		if (user?.uuid) this.presence.forget(user.uuid);
		return ApiResponseHelper.sendResponse(res, { ok: true });
	}

	@Get('/active-users')
	@ApiOperation({
		summary:
			'Super-admin: list users seen within the last N minutes (default 2, max 60). Reads from the in-memory presence map — no DB access for the list itself. Enriched with tenant display info in a single query so the UI can group by tenant without per-row round-trips.',
	})
	@ApiQuery({ name: 'minutes', required: false })
	async activeUsers(@Res() res: Response, @CurrentUser() user: any, @Query('minutes') minutes?: string) {
		if (user?.type !== 'admin') {
			return ApiResponseHelper.sendResponse(res, null, 'Admin token required.', 403);
		}

		const raw = Number(minutes);
		const windowMinutes = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 60) : 2;

		const entries = this.presence.list({ sinceMs: windowMinutes * 60_000, type: 'user' });

		const tenantUuids = Array.from(new Set(entries.map((e) => e.tenant_uuid).filter((v): v is string => !!v)));
		const tenants = tenantUuids.length
			? ((await Tenant.query()
					.select('uuid', 'display_name', 'store_code')
					.whereIn('uuid', tenantUuids)) as unknown as Array<{ uuid: string; display_name: string; store_code: string }>)
			: [];
		const byUuid = new Map(tenants.map((t) => [t.uuid, t]));

		const now = Date.now();
		const results = entries
			.map((e) => {
				const t = e.tenant_uuid ? byUuid.get(e.tenant_uuid) : null;
				return {
					uuid: e.uuid,
					username: e.username,
					name: e.name,
					role: e.role,
					tenant_uuid: e.tenant_uuid ?? null,
					tenant_display_name: t?.display_name ?? null,
					tenant_store_code: t?.store_code ?? null,
					last_seen_at: new Date(e.last_seen_at).toISOString(),
					seconds_ago: Math.round((now - e.last_seen_at) / 1000),
					ip: e.ip ?? null,
					user_agent: e.user_agent ?? null,
				};
			})
			.sort((a, b) => a.seconds_ago - b.seconds_ago);

		const tenantCount = new Set(results.map((r) => r.tenant_uuid).filter(Boolean)).size;

		return ApiResponseHelper.sendResponse(res, {
			window_minutes: windowMinutes,
			as_of: new Date(now).toISOString(),
			user_count: results.length,
			tenant_count: tenantCount,
			results,
		});
	}
}
