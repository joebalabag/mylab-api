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

import { ItemCategoryService } from './item-category.service';
import {
	CreateItemCategoryDTO,
	ItemCategoryDashboardQueryDTO,
	SetItemCategoryStatusDTO,
	UpdateItemCategoryDTO,
} from './dto/item-category.dto';
import { ItemCategory } from './item-category.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: ItemCategory) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Item category belongs to a different tenant.');
}

@ApiTags('Item Category')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('item-category')
export class ItemCategoryController {
	constructor(private readonly service: ItemCategoryService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Item Category - Dashboard list. Optional item_group_uuid filter.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: ItemCategoryDashboardQueryDTO,
		@CurrentUser() current: any
	) {
		try {
			const scoped: ItemCategoryDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Item Category - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Item category not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Item Category - Create' })
	@ApiBody({ type: CreateItemCategoryDTO })
	async create(@Res() res: Response, @Body() data: CreateItemCategoryDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');

			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}
			const group = await this.service.findGroupInTenant(data.item_group_uuid, tenant_uuid);
			if (!group) {
				return ApiResponseHelper.sendBadRequest(res, 'Item group not found or belongs to a different tenant.');
			}
			if (await this.service.codeTaken(tenant_uuid, data.code)) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists for this tenant.');
			}

			const created = await this.service.create({
				tenant_uuid,
				item_group_uuid: data.item_group_uuid,
				code: data.code,
				name: data.name,
				description: data.description,
				combine_printout: data.combine_printout,
				color: data.color,
				print_title: data.print_title,
				print_template: data.print_template,
				print_paper_size: data.print_paper_size,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Item category created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Item Category - Update' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateItemCategoryDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateItemCategoryDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item category not found.');
			assertOwns(current, existing);

			if (data.item_group_uuid && data.item_group_uuid !== existing.item_group_uuid) {
				const group = await this.service.findGroupInTenant(data.item_group_uuid, existing.tenant_uuid);
				if (!group) {
					return ApiResponseHelper.sendBadRequest(res, 'Item group not found or belongs to a different tenant.');
				}
			}

			if (data.code && data.code !== existing.code) {
				if (await this.service.codeTaken(existing.tenant_uuid, data.code, uuid)) {
					return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists for this tenant.');
				}
			}

			const patch: any = { ...data, updated_by: current?.name || current?.username || 'system' };
			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Item category updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Item Category - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item category not found.');
			assertOwns(current, existing);

			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Item category deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Item Category - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetItemCategoryStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetItemCategoryStatusDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item category not found.');
			assertOwns(current, existing);

			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Item category set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
