import { Controller, ForbiddenException, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { SetupReadinessService } from './setup-readiness.service';

function scope(current: any, requested?: string): string {
	if (current?.type === 'admin') {
		if (!requested) throw new ForbiddenException('tenant_uuid is required for admin token.');
		return requested;
	}
	if (current?.type === 'user' && current.tenant_uuid) return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

@ApiTags('Setup Readiness')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('setup-readiness')
export class SetupReadinessController {
	constructor(private readonly service: SetupReadinessService) {}

	@Get('/status')
	@ApiOperation({
		summary:
			'Setup Readiness - End-to-end checklist status for the current tenant. Groups steps into setup / catalog / operations and returns required-step progress + overall ready flag.',
	})
	@ApiQuery({ name: 'tenant_uuid', required: false, description: 'Admin-only override.' })
	async status(@Res() res: Response, @Query('tenant_uuid') tenant_uuid: string | undefined, @CurrentUser() current: any) {
		try {
			const t = scope(current, tenant_uuid);
			return ApiResponseHelper.sendResponse(res, await this.service.getStatus(t));
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}
}
