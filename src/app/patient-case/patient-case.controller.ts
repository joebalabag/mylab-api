import {
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	Param,
	Patch,
	Post,
	Query,
	Res,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

import { PatientCaseService } from './patient-case.service';
import {
	CreatePatientCaseDTO,
	PatientCaseDashboardQueryDTO,
	SetPatientCaseStatusDTO,
	UpdatePatientCaseDTO,
} from './dto/patient-case.dto';
import { PatientCase } from './patient-case.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: PatientCase) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Patient case belongs to a different tenant.');
}

@ApiTags('Patient Case')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('patient-case')
export class PatientCaseController {
	constructor(private readonly service: PatientCaseService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Patient Case - Dashboard list. Filter by patient_uuid, case_type, date, status, keywords.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: PatientCaseDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const scoped: PatientCaseDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Patient Case - View by uuid (joined with patient identity fields).' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Patient case not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Patient Case - Create. case_number is auto-generated: "<TYPE>-NNNNNN" per (tenant, case_type).' })
	@ApiBody({ type: CreatePatientCaseDTO })
	async create(@Res() res: Response, @Body() data: CreatePatientCaseDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}
			const patient = await this.service.findPatientInTenant(data.patient_uuid, tenant_uuid);
			if (!patient) {
				return ApiResponseHelper.sendBadRequest(res, 'Patient not found or belongs to a different tenant.');
			}
			const created = await this.service.create({
				tenant_uuid,
				patient_uuid: data.patient_uuid,
				case_type: data.case_type,
				admission_date: data.admission_date,
				discharge_date: data.discharge_date,
				chief_complaint: data.chief_complaint,
				attending_physician: data.attending_physician,
				referring_physician: data.referring_physician,
				notes: data.notes,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Patient case created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Patient Case - Update. case_number is immutable.' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdatePatientCaseDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdatePatientCaseDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Patient case not found.');
			assertOwns(current, existing);
			const patch: any = { ...data, updated_by: current?.name || current?.username || 'system' };
			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Patient case updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Patient Case - Delete (cascades to requisitions and their items).' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Patient case not found.');
			assertOwns(current, existing);
			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Patient case deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Patient Case - Set status (open / closed / cancelled).' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetPatientCaseStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetPatientCaseStatusDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Patient case not found.');
			assertOwns(current, existing);
			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Patient case set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
