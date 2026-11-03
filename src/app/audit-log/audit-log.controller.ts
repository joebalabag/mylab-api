import { Controller, ForbiddenException, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { SkipSubscriptionCheck } from '@/common/decorators/skip-subscription-check.decorator';
import { applyPagination } from '@/common/helpers/pagination.helper';

import { AuditLog } from './audit-log.model';
import { AuditLogDashboardQueryDTO } from './dto/audit-log.dto';

function resolveTenantScope(current: any, requested?: string): string | undefined {
	if (current?.type === 'admin') return requested;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

/**
 * `IsDateString()` accepts both `YYYY-MM-DD` and full ISO datetimes, so naively
 * concatenating `' 23:59:59'` onto `date_to` produced garbage like
 * `2026-11-04T00:00:00.000Z 23:59:59`. Parse-and-stamp instead: use the Y/M/D
 * portion to build a local-tz boundary (TZ is Asia/Manila process-wide), which
 * works whether the caller sent a bare date or an ISO datetime.
 */
function parseDateBoundary(input: string | undefined, endOfDay: boolean): Date | null {
	if (!input) return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
	if (!m) return null;
	const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
	return endOfDay ? new Date(y, mo, d, 23, 59, 59, 999) : new Date(y, mo, d, 0, 0, 0, 0);
}

function buildQuery(filters: AuditLogDashboardQueryDTO, tenant_uuid: string | undefined, forceTenant: boolean) {
	const q = AuditLog.query().orderBy('created_at', 'desc');

	if (forceTenant) {
		if (!tenant_uuid) throw new ForbiddenException('Tenant scope required.');
		q.where('tenant_uuid', tenant_uuid);
	} else if (tenant_uuid) {
		q.where('tenant_uuid', tenant_uuid);
	}

	if (filters.entity_type) q.where('entity_type', filters.entity_type);
	if (filters.entity_uuid) q.where('entity_uuid', filters.entity_uuid);
	if (filters.actor_uuid) q.where('actor_uuid', filters.actor_uuid);
	if (filters.action) q.where('action', filters.action);
	const from = parseDateBoundary(filters.date_from, false);
	const to   = parseDateBoundary(filters.date_to,   true);
	if (from) q.where('created_at', '>=', from);
	if (to)   q.where('created_at', '<=', to);
	if (filters.keywords) {
		const kw = `%${filters.keywords}%`;
		q.where((b) => {
			b.where('summary', 'ilike', kw)
				.orWhere('actor_label', 'ilike', kw)
				.orWhere('entity_type', 'ilike', kw)
				.orWhere('action', 'ilike', kw);
		});
	}
	return q;
}

@ApiTags('Audit Log')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller()
export class AuditLogController {
	@Get('/audit-log/dashboard')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Audit Log - Tenant-scoped list. Tenant users see only their own tenant\'s rows; super-admins can pass tenant_uuid to narrow. Newest first.',
	})
	async dashboard(
		@Res() res: Response,
		@Query() filters: AuditLogDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, filters.tenant_uuid);
			const q = buildQuery(filters, tenant_uuid, current?.type === 'user');
			const output = await applyPagination(q, filters.page_number, filters.page_size);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/audit-log/entity/:type/:uuid')
	@SkipSubscriptionCheck()
	@ApiOperation({ summary: 'Audit Log - History for a single record. Tenant-scoped.' })
	@ApiParam({ name: 'type', required: true })
	@ApiParam({ name: 'uuid', required: true })
	async entityHistory(
		@Res() res: Response,
		@Param('type') type: string,
		@Param('uuid') uuid: string,
		@CurrentUser() current: any,
	) {
		try {
			const q = AuditLog.query()
				.where('entity_type', type)
				.where('entity_uuid', uuid)
				.orderBy('created_at', 'desc')
				.limit(200);
			if (current?.type === 'user') q.where('tenant_uuid', current.tenant_uuid);
			const rows = await q;
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/super/audit-log/dashboard')
	@SkipSubscriptionCheck()
	@ApiOperation({ summary: 'Audit Log - Cross-tenant list (super-admin only).' })
	async superDashboard(
		@Res() res: Response,
		@Query() filters: AuditLogDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			if (current?.type !== 'admin') throw new ForbiddenException('Admin token required.');
			const q = buildQuery(filters, filters.tenant_uuid, false);
			const output = await applyPagination(q, filters.page_number, filters.page_size);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
