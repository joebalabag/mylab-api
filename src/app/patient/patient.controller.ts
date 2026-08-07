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

import { PatientService } from './patient.service';
import {
	CreatePatientDTO,
	PatientDashboardQueryDTO,
	PatientSearchQueryDTO,
	SetPatientStatusDTO,
	UpdatePatientDTO,
} from './dto/patient.dto';
import { Patient } from './patient.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: Patient) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Patient belongs to a different tenant.');
}

@ApiTags('Patient')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('patient')
export class PatientController {
	constructor(private readonly service: PatientService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Patient - Dashboard list. Keyword hits MRN, first/middle/last name, contact, national_id.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: PatientDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const scoped: PatientDashboardQueryDTO = {
				...filters,
				tenant_uuid: resolveTenantScope(current, filters.tenant_uuid),
			};
			const output = await this.service.listDashboard(scoped);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/search')
	@ApiOperation({
		summary:
			'Patient - Duplicate-check search. Called before opening the Add form. Case-insensitive prefix match on first_name and/or last_name; optional birthdate exact match; tenant-scoped.',
	})
	async search(
		@Res() res: Response,
		@Query() filters: PatientSearchQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, filters.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const rows = await this.service.search({ ...filters, tenant_uuid });
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/view/:uuid')
	@ApiOperation({ summary: 'Patient - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Patient not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({
		summary:
			'Patient - Create. MRN is auto-generated server-side (P-NNNNNN, per tenant). Frontend should run /search first — this endpoint does NOT block on same-name existing patients (soft-match by design).',
	})
	@ApiBody({ type: CreatePatientDTO })
	async create(@Res() res: Response, @Body() data: CreatePatientDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}
			const { tenant_uuid: _drop, ...rest } = data as any;
			const created = await this.service.create({
				...rest,
				tenant_uuid,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Patient registered.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Patient - Update' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdatePatientDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdatePatientDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Patient not found.');
			assertOwns(current, existing);

			const patch: any = { ...data, updated_by: current?.name || current?.username || 'system' };
			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Patient updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Patient - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Patient not found.');
			assertOwns(current, existing);
			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Patient deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Patient - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetPatientStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetPatientStatusDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Patient not found.');
			assertOwns(current, existing);
			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Patient set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
