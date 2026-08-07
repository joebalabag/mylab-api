import {
	Controller,
	ForbiddenException,
	Get,
	Param,
	Query,
	Res,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { SkipSubscriptionCheck } from '@/common/decorators/skip-subscription-check.decorator';

import { TenantSubscriptionHistoryService } from './tenant-subscription-history.service';
import {
	SubscriptionHistoryDashboardQueryDTO,
	SubscriptionHistoryForTenantQueryDTO,
} from './dto/tenant-subscription-history.dto';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertCanReadTenant(current: any, tenant_uuid: string) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === tenant_uuid) return;
	throw new ForbiddenException('History belongs to a different tenant.');
}

@ApiTags('Tenant Subscription History')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('tenant-subscription-history')
export class TenantSubscriptionHistoryController {
	constructor(private readonly service: TenantSubscriptionHistoryService) {}

	@Get('/dashboard')
	@ApiOperation({
		summary:
			'Read-only list of tenant_subscription_history rows. Admin: cross-tenant. User token: auto-scoped to own tenant. Filters: tenant_uuid, row_status, status[], payment_uuid, has_alter_reason, date range, keywords, pagination.',
	})
	async dashboard(
		@Res() res: Response,
		@Query() filters: SubscriptionHistoryDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const scoped: SubscriptionHistoryDashboardQueryDTO = {
				...filters,
				tenant_uuid: resolveTenantScope(current, filters.tenant_uuid),
			};
			const output = await this.service.listDashboard(scoped);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/for-tenant/:tenant_uuid')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Chronological subscription timeline for one tenant (newest first). Admin: any tenant. User: only own tenant. Optional row_status filter and limit.',
	})
	@ApiParam({ name: 'tenant_uuid', required: true })
	async forTenant(
		@Res() res: Response,
		@Param('tenant_uuid') tenant_uuid: string,
		@Query() filters: SubscriptionHistoryForTenantQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			assertCanReadTenant(current, tenant_uuid);
			const rows = await this.service.listForTenant(tenant_uuid, filters);
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/view/:uuid')
	@ApiOperation({ summary: 'View a single history row (includes alter_reason for super-admin overrides).' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'History row not found.');
			assertCanReadTenant(current, row.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
