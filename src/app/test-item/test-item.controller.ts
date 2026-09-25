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

import { TestItemService } from './test-item.service';
import {
	CreateTestItemDTO,
	SetTestItemStatusDTO,
	SyncTestItemComponentsDTO,
	TestItemDashboardQueryDTO,
	UpdateTestItemDTO,
} from './dto/test-item.dto';
import { TestItem } from './test-item.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: TestItem) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Test item belongs to a different tenant.');
}

@ApiTags('Test Item')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('test-item')
export class TestItemController {
	constructor(private readonly service: TestItemService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Test Item - Dashboard list. Filter by item_category_uuid, item_group_uuid, result_type.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: TestItemDashboardQueryDTO,
		@CurrentUser() current: any
	) {
		try {
			const scoped: TestItemDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Test Item - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Test item not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Test Item - Create' })
	@ApiBody({ type: CreateTestItemDTO })
	async create(@Res() res: Response, @Body() data: CreateTestItemDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');

			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}
			const category = await this.service.findCategoryInTenant(data.item_category_uuid, tenant_uuid);
			if (!category) {
				return ApiResponseHelper.sendBadRequest(res, 'Item category not found or belongs to a different tenant.');
			}
			if (await this.service.codeTaken(tenant_uuid, data.code)) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists for this tenant.');
			}

			const created = await this.service.create({
				tenant_uuid,
				item_category_uuid: data.item_category_uuid,
				code: data.code,
				name: data.name,
				result_type: data.result_type,
				specimen: data.specimen,
				unit_of_measure: data.unit_of_measure,
				reference_range: data.reference_range,
				method: data.method,
				lookup_values: data.lookup_values,
				matrix_config: data.matrix_config ?? null,
				si_conversion_factor: data.si_conversion_factor ?? null,
				si_unit_of_measure: data.si_unit_of_measure,
				si_reference_range: data.si_reference_range,
				price: data.price,
				description: data.description,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Test item created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Test Item - Update' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateTestItemDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateTestItemDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Test item not found.');
			assertOwns(current, existing);

			if (data.item_category_uuid && data.item_category_uuid !== existing.item_category_uuid) {
				const category = await this.service.findCategoryInTenant(data.item_category_uuid, existing.tenant_uuid);
				if (!category) {
					return ApiResponseHelper.sendBadRequest(res, 'Item category not found or belongs to a different tenant.');
				}
			}

			if (data.code && data.code !== existing.code) {
				if (await this.service.codeTaken(existing.tenant_uuid, data.code, uuid)) {
					return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists for this tenant.');
				}
			}

			const patch: any = { ...data, updated_by: current?.name || current?.username || 'system' };
			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Test item updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Test Item - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Test item not found.');
			assertOwns(current, existing);

			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Test item deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Put('/:uuid/components')
	@ApiOperation({
		summary:
			'Test Item - Sync components (bulk). Upserts by uuid, inserts new rows, deletes any existing component whose uuid is not in the payload.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SyncTestItemComponentsDTO })
	async syncComponents(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SyncTestItemComponentsDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Test item not found.');
			assertOwns(current, existing);

			const updated_by = current?.name || current?.username || 'system';
			const components = await this.service.syncComponents(existing, data.components || [], updated_by);
			return ApiResponseHelper.sendResponse(res, { uuid, components }, 'Components saved.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Test Item - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetTestItemStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetTestItemStatusDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Test item not found.');
			assertOwns(current, existing);

			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Test item set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
