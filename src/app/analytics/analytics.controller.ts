import { Controller, ForbiddenException, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDTO } from './dto/analytics-query.dto';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string {
	if (current?.type === 'admin') {
		if (!requestedTenantUuid) throw new ForbiddenException('tenant_uuid is required for admin token.');
		return requestedTenantUuid;
	}
	if (current?.type === 'user' && current.tenant_uuid) return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('analytics')
export class AnalyticsController {
	constructor(private readonly service: AnalyticsService) {}

	@Get('/revenue-summary')
	@ApiOperation({
		summary:
			'Analytics - Revenue KPIs. Collected (cash + resolved arrangements), outstanding arrangements (as-of-now), and today\'s cash-in-hand.',
	})
	async revenueSummary(@Res() res: Response, @Query() q: AnalyticsQueryDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, q.tenant_uuid);
			const out = await this.service.revenueSummary(tenant_uuid, q.date_from, q.date_to);
			return ApiResponseHelper.sendResponse(res, out);
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}

	@Get('/revenue-trend')
	@ApiOperation({ summary: 'Analytics - Daily revenue timeseries (line chart).' })
	async revenueTrend(@Res() res: Response, @Query() q: AnalyticsQueryDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, q.tenant_uuid);
			const out = await this.service.revenueTrend(tenant_uuid, q.date_from, q.date_to);
			return ApiResponseHelper.sendResponse(res, out);
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}

	@Get('/method-breakdown')
	@ApiOperation({ summary: 'Analytics - Revenue by payment method (doughnut chart).' })
	async methodBreakdown(@Res() res: Response, @Query() q: AnalyticsQueryDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, q.tenant_uuid);
			const out = await this.service.methodBreakdown(tenant_uuid, q.date_from, q.date_to);
			return ApiResponseHelper.sendResponse(res, out);
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}

	@Get('/receivables-aging')
	@ApiOperation({
		summary:
			'Analytics - Outstanding arrangements aging buckets (0-30 / 31-60 / 61-90 / 90+), top billed_to counter-parties, and oldest-pending list.',
	})
	async receivablesAging(@Res() res: Response, @Query() q: AnalyticsQueryDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, q.tenant_uuid);
			const out = await this.service.receivablesAging(tenant_uuid, q.limit ?? 10);
			return ApiResponseHelper.sendResponse(res, out);
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}

	@Get('/throughput')
	@ApiOperation({ summary: 'Analytics - Cases created + requisitions finalized per day.' })
	async throughput(@Res() res: Response, @Query() q: AnalyticsQueryDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, q.tenant_uuid);
			const out = await this.service.throughput(tenant_uuid, q.date_from, q.date_to);
			return ApiResponseHelper.sendResponse(res, out);
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}

	@Get('/top-items')
	@ApiOperation({ summary: 'Analytics - Top-N test items by revenue.' })
	async topItems(@Res() res: Response, @Query() q: AnalyticsQueryDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, q.tenant_uuid);
			const out = await this.service.topItems(tenant_uuid, q.date_from, q.date_to, q.limit ?? 10);
			return ApiResponseHelper.sendResponse(res, out);
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}

	@Get('/profitability')
	@ApiOperation({ summary: 'Analytics - Revenue vs expenses per day + totals + net.' })
	async profitability(@Res() res: Response, @Query() q: AnalyticsQueryDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, q.tenant_uuid);
			const out = await this.service.profitability(tenant_uuid, q.date_from, q.date_to);
			return ApiResponseHelper.sendResponse(res, out);
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}
}
