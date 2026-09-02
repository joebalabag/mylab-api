import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	Query,
	Res,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AllowOfflineToken } from '@/common/decorators/allow-offline-token.decorator';
import { OfflineTokenGuard } from '@/common/guards/offline-token.guard';

import { OfflineSyncService, OfflineActor } from './offline-sync.service';
import {
	EnableDeviceDTO,
	PullQueryDTO,
	RefreshDeviceDTO,
	SyncBatchDTO,
} from './dto/offline-sync.dto';

/**
 * All routes require a tenant-scoped user JWT. The Phase 3 guard change will
 * also accept the long-lived "offline" JWT minted by /enable and /refresh —
 * for now, only the online user token is accepted.
 */
@ApiTags('Offline Sync')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), OfflineTokenGuard)
@Controller('offline')
export class OfflineSyncController {
	constructor(private readonly service: OfflineSyncService) {}

	// `/enable` deliberately does NOT allow offline tokens — a station has to
	// authenticate with a fresh online user login before it can bind itself
	// as an offline device. Same for /devices and /devices/:uuid/revoke,
	// which are admin actions.
	@Post('enable')
	@ApiOperation({ summary: 'Register the current station as an offline device and mint a long-lived offline JWT.' })
	async enable(
		@CurrentUser() user: OfflineActor,
		@Body() dto: EnableDeviceDTO,
		@Res() res: Response,
	) {
		const result = await this.service.enableDevice(user, dto);
		return ApiResponseHelper.sendResponse(res, result, 'Offline device enabled.');
	}

	@Post('refresh')
	@AllowOfflineToken()
	@ApiOperation({ summary: 'Refresh the offline JWT and record a clock-skew check.' })
	async refresh(
		@CurrentUser() user: OfflineActor,
		@Body() dto: RefreshDeviceDTO,
		@Res() res: Response,
	) {
		const result = await this.service.refresh(user, dto);
		return ApiResponseHelper.sendResponse(res, result, 'Offline token refreshed.');
	}

	@Get('bootstrap')
	@AllowOfflineToken()
	@ApiOperation({ summary: 'Full initial cache seed: reference data + rolling patient/case/payment/lab_report history.' })
	async bootstrap(@CurrentUser() user: OfflineActor, @Res() res: Response) {
		const result = await this.service.bootstrap(user);
		return ApiResponseHelper.sendResponse(res, result, 'Offline bootstrap ready.');
	}

	@Get('pull')
	@AllowOfflineToken()
	@ApiOperation({ summary: 'Incremental delta of records updated after `since`.' })
	async pull(
		@CurrentUser() user: OfflineActor,
		@Query() query: PullQueryDTO,
		@Res() res: Response,
	) {
		const result = await this.service.pull(user, query.since);
		return ApiResponseHelper.sendResponse(res, result, 'Offline pull ready.');
	}

	@Post('sync')
	@AllowOfflineToken()
	@ApiOperation({ summary: 'Drain a batch of outbox entries. Each entry has its own idempotency key.' })
	async sync(
		@CurrentUser() user: OfflineActor,
		@Body() dto: SyncBatchDTO,
		@Res() res: Response,
	) {
		const result = await this.service.sync(user, dto);
		return ApiResponseHelper.sendResponse(res, result, 'Sync batch processed.');
	}

	@Get('devices')
	@ApiOperation({ summary: 'List offline-enabled stations for the tenant.' })
	async devices(@CurrentUser() user: OfflineActor, @Res() res: Response) {
		const result = await this.service.listDevices(user);
		return ApiResponseHelper.sendResponse(res, result, 'Devices loaded.');
	}

	@Post('devices/:uuid/revoke')
	@ApiOperation({ summary: 'Revoke a device — its next /refresh call is rejected.' })
	async revoke(
		@CurrentUser() user: OfflineActor,
		@Param('uuid') uuid: string,
		@Body() body: { reason?: string },
		@Res() res: Response,
	) {
		const result = await this.service.revokeDevice(user, uuid, body?.reason);
		return ApiResponseHelper.sendResponse(res, result, 'Device revoked.');
	}
}
