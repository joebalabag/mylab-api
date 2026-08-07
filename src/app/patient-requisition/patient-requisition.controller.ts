import {
	Body,
	Controller,
	Delete,
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

import { PatientRequisitionService } from './patient-requisition.service';
import {
	CreatePatientRequisitionDTO,
	PatientRequisitionDashboardQueryDTO,
	SetPatientRequisitionDiscountDTO,
	SetPatientRequisitionStatusDTO,
	SyncPatientRequisitionItemsDTO,
	UpdatePatientRequisitionDTO,
} from './dto/patient-requisition.dto';
import { PatientRequisition } from './patient-requisition.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: PatientRequisition) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Requisition belongs to a different tenant.');
}

@ApiTags('Patient Requisition')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('patient-requisition')
export class PatientRequisitionController {
	constructor(private readonly service: PatientRequisitionService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Requisition - Dashboard list. Filter by patient_case_uuid, patient_uuid, status, date, keywords.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: PatientRequisitionDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const scoped: PatientRequisitionDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Requisition - View by uuid (eager-loads items and joined patient/case identifiers).' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Requisition not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Requisition - Create (parent only, draft status). requisition_number auto-generated: "R-NNNNNN" per tenant.' })
	@ApiBody({ type: CreatePatientRequisitionDTO })
	async create(
		@Res() res: Response,
		@Body() data: CreatePatientRequisitionDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}
			const kase = await this.service.findCaseInTenant(data.patient_case_uuid, tenant_uuid);
			if (!kase) {
				return ApiResponseHelper.sendBadRequest(res, 'Patient case not found or belongs to a different tenant.');
			}
			const created = await this.service.create({
				tenant_uuid,
				patient_case_uuid: data.patient_case_uuid,
				patient_uuid: kase.patient_uuid,
				requisition_date: data.requisition_date,
				notes: data.notes,
				physician: data.physician,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Requisition created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Requisition - Update (date / notes). Cached totals and requisition_number are server-owned.' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdatePatientRequisitionDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdatePatientRequisitionDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Requisition not found.');
			assertOwns(current, existing);
			const patch: any = { ...data, updated_by: current?.name || current?.username || 'system' };
			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Requisition updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Put('/:uuid/items')
	@ApiOperation({
		summary:
			'Requisition - Sync items (bulk). Upsert / insert / delete against the current lines. Snapshots code/name/unit_price from the source (test_item or item_package) for new rows. Recomputes subtotal, reapplies the current discount snapshot, and updates total.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SyncPatientRequisitionItemsDTO })
	async syncItems(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SyncPatientRequisitionItemsDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Requisition not found.');
			assertOwns(current, existing);
			const out = await this.service.syncItems(
				existing,
				data.items || [],
				current?.name || current?.username || 'system',
			);
			return ApiResponseHelper.sendResponse(res, { uuid, ...out }, 'Requisition items saved.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/:uuid/discount')
	@ApiOperation({
		summary:
			'Requisition - Set / clear the requisition-level discount. Snapshots the discount (type + value) and recomputes discount_amount + total. Pass discount_uuid=null or clear=true to remove.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetPatientRequisitionDiscountDTO })
	async setDiscount(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetPatientRequisitionDiscountDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Requisition not found.');
			assertOwns(current, existing);
			const out = await this.service.setDiscount(
				existing,
				data,
				current?.name || current?.username || 'system',
			);
			return ApiResponseHelper.sendResponse(res, out, 'Discount applied.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Requisition - Delete (cascades to items).' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Requisition not found.');
			assertOwns(current, existing);
			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Requisition deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Requisition - Set status (draft / finalized / cancelled).' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetPatientRequisitionStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetPatientRequisitionStatusDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Requisition not found.');
			assertOwns(current, existing);
			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Requisition set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
