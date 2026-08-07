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

import { ItemPackageService } from './item-package.service';
import {
	CreateItemPackageDTO,
	ItemPackageDashboardQueryDTO,
	SetItemPackageStatusDTO,
	SyncItemPackageItemsDTO,
	UpdateItemPackageDTO,
} from './dto/item-package.dto';
import { ItemPackage } from './item-package.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: ItemPackage) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Item package belongs to a different tenant.');
}

@ApiTags('Item Package')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('item-package')
export class ItemPackageController {
	constructor(private readonly service: ItemPackageService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Item Package - Dashboard list. Rows include item_count. Filter by keywords/status/date.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: ItemPackageDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const scoped: ItemPackageDashboardQueryDTO = {
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
	@ApiOperation({
		summary:
			'Item Package - View by uuid. Response eager-loads the items array joined against test_items (code, name, result_type, and the LIVE current price).',
	})
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Item package not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Item Package - Create (parent only). Use /:uuid/items to attach test items.' })
	@ApiBody({ type: CreateItemPackageDTO })
	async create(@Res() res: Response, @Body() data: CreateItemPackageDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}
			if (await this.service.codeTaken(tenant_uuid, data.code)) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists for this tenant.');
			}
			const created = await this.service.create({
				tenant_uuid,
				code: data.code,
				name: data.name,
				description: data.description,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Item package created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Item Package - Update (code / name / description).' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateItemPackageDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateItemPackageDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item package not found.');
			assertOwns(current, existing);

			if (data.code && data.code !== existing.code) {
				if (await this.service.codeTaken(existing.tenant_uuid, data.code, uuid)) {
					return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists for this tenant.');
				}
			}

			const patch: any = { ...data, updated_by: current?.name || current?.username || 'system' };
			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Item package updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Put('/:uuid/items')
	@ApiOperation({
		summary:
			'Item Package - Sync items (bulk). Upserts by uuid, inserts new rows, deletes any existing item whose uuid is not in the payload. Recomputes parent.package_price = SUM(new_price).',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SyncItemPackageItemsDTO })
	async syncItems(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SyncItemPackageItemsDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item package not found.');
			assertOwns(current, existing);
			const updated_by = current?.name || current?.username || 'system';
			const out = await this.service.syncItems(existing, data.items || [], updated_by);
			return ApiResponseHelper.sendResponse(
				res,
				{ uuid, items: out.items, package_price: out.package_price },
				'Package items saved.',
			);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Item Package - Delete (cascade drops the items).' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item package not found.');
			assertOwns(current, existing);
			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Item package deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Item Package - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetItemPackageStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetItemPackageStatusDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item package not found.');
			assertOwns(current, existing);
			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Item package set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
