import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	Param,
	Patch,
	Post,
	Put,
	Query,
	Res,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

import { LabReportService } from './lab-report.service';
import {
	CreateLabReportBatchDTO,
	LabReportDashboardQueryDTO,
	SetLabReportFinalDTO,
	SetLabReportStatusDTO,
	UpdateLabReportResultsDTO,
	VoidLabReportDTO,
} from './dto/lab-report.dto';
import { LabReport } from './lab-report.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: LabReport) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Lab report belongs to a different tenant.');
}

@ApiTags('Lab Report')
@Controller('lab-report')
export class LabReportController {
	constructor(private readonly service: LabReportService) {}

	// Public no-auth endpoint for the QR-code landing page. Verifies the
	// signed token (HMAC-SHA256 of the lab_report uuid with JWT_SECRET) and
	// returns the report + minimal tenant metadata.
	@Get('/public/view')
	@ApiOperation({ summary: 'Lab Report - Public read-only view. Requires a signed token from /view.' })
	async publicView(@Res() res: Response, @Query('t') token: string) {
		try {
			if (!token) return ApiResponseHelper.sendBadRequest(res, 'Missing token.');
			const row = await this.service.findByPublicToken(token);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Lab report not found or link is invalid.');
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}

@ApiTags('Lab Report')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('lab-report')
export class LabReportAuthedController {
	constructor(private readonly service: LabReportService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Lab Report - Dashboard list. Filter by status / date / keywords / patient / requisition.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: LabReportDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const scoped: LabReportDashboardQueryDTO = {
				...filters,
				tenant_uuid: resolveTenantScope(current, filters.tenant_uuid),
			};
			const output = await this.service.listDashboard(scoped);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/view/:uuid')
	@ApiOperation({ summary: 'Lab Report - View by uuid (eager-loads items + result values).' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Lab report not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/eligible-requisitions')
	@ApiOperation({
		summary:
			'Lab Report - List paid requisitions that still have uncovered test lines. Feeds step 1 of the Add Laboratory modal.',
	})
	async eligibleRequisitions(
		@Res() res: Response,
		@Query('tenant_uuid') requestedTenant: string | undefined,
		@Query('keywords') keywords: string | undefined,
		@Query('item_group_uuid') item_group_uuid: string | undefined,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, requestedTenant);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const rows = await this.service.listEligibleRequisitions(tenant_uuid, keywords, item_group_uuid);
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/uncovered-items/:requisition_uuid')
	@ApiOperation({
		summary:
			'Lab Report - List a paid requisition\'s uncovered test lines + item_category metadata. Feeds step 2 of the Add Laboratory modal so the frontend can pre-group by combine_printout.',
	})
	@ApiParam({ name: 'requisition_uuid', required: true })
	async uncoveredItems(
		@Res() res: Response,
		@Param('requisition_uuid') requisition_uuid: string,
		@Query('tenant_uuid') requestedTenant: string | undefined,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, requestedTenant);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const out = await this.service.listUncoveredItems(tenant_uuid, requisition_uuid);
			return ApiResponseHelper.sendResponse(res, out);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create-batch')
	@ApiOperation({
		summary:
			'Lab Report - Create one or more draft lab_reports from a paid requisition. Each group becomes one lab_report with its own auto-generated lab_number. Seeds lab_result_values for single/panel test_items.',
	})
	@ApiBody({ type: CreateLabReportBatchDTO })
	async createBatch(
		@Res() res: Response,
		@Body() data: CreateLabReportBatchDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const created = await this.service.createBatch(data, tenant_uuid, {
				uuid: current?.uuid,
				name: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, `Created ${created.length} lab report(s).`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Put('/:uuid/results')
	@ApiOperation({
		summary:
			'Lab Report - Bulk update result values on a DRAFT lab_report. Rejected once finalized (correct via void + re-issue).',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateLabReportResultsDTO })
	async updateResults(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateLabReportResultsDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Lab report not found.');
			assertOwns(current, existing);
			const updated = await this.service.updateResults(uuid, data, {
				name: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, updated, 'Results saved.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/:uuid/set-final')
	@ApiOperation({
		summary:
			'Lab Report - Tag as Final. Snapshots the pathologist name (from body, else the acting user), stamps finalized_at, and locks the report from further edits.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetLabReportFinalDTO })
	async setFinal(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetLabReportFinalDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Lab report not found.');
			assertOwns(current, existing);
			const updated = await this.service.setFinal(uuid, {
				pathologist_name: data.pathologist_name,
				pathologist_doctor_uuid: data.pathologist_doctor_uuid,
				signatory_username: data.signatory_username,
				signatory_password: data.signatory_password,
			}, {
				uuid: current?.uuid,
				name: current?.name || current?.username || 'system',
				lab_display_name: current?.lab_display_name ?? null,
				license_number: current?.license_number ?? null,
			});
			return ApiResponseHelper.sendResponse(res, updated, 'Lab report finalized.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/:uuid/unset-final')
	@ApiOperation({
		summary:
			'Lab Report - Untag as Final. Reopens a finalized report back to draft so results can be modified. Clears the pathologist snapshot and finalized_at.',
	})
	@ApiParam({ name: 'uuid', required: true })
	async unsetFinal(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Lab report not found.');
			assertOwns(current, existing);
			const updated = await this.service.unsetFinal(uuid, {
				name: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, updated, 'Lab report re-opened to draft.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/:uuid/void')
	@ApiOperation({
		summary:
			'Lab Report - Void with reason. Releases the underlying requisition_items so they can be re-issued as a fresh draft report.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: VoidLabReportDTO })
	async voidReport(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: VoidLabReportDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Lab report not found.');
			assertOwns(current, existing);
			const updated = await this.service.void(uuid, data.reason, {
				name: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, updated, 'Lab report voided.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/:uuid/default-signatory')
	@ApiOperation({
		summary:
			'Lab Report - Default signatory doctor for this report (item_group signatory). Frontend calls this when opening the Tag-as-Final modal to preview the auto-fill.',
	})
	@ApiParam({ name: 'uuid', required: true })
	async defaultSignatory(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Lab report not found.');
			assertOwns(current, existing);
			const doctor = await this.service.getDefaultSignatory(uuid);
			return ApiResponseHelper.sendResponse(res, doctor);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Lab Report - Set status directly (admin utility).' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetLabReportStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetLabReportStatusDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Lab report not found.');
			assertOwns(current, existing);
			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Lab report set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
