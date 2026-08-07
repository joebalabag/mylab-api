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

import { ItemGroupService } from './item-group.service';
import {
	CreateItemGroupDTO,
	ImportPreloadedCatalogDTO,
	ItemGroupDashboardQueryDTO,
	SetItemGroupStatusDTO,
	UpdateItemGroupDTO,
} from './dto/item-group.dto';
import { ItemGroup } from './item-group.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: ItemGroup) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Item group belongs to a different tenant.');
}

@ApiTags('Item Group')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('item-group')
export class ItemGroupController {
	constructor(private readonly service: ItemGroupService) {}

	@Get('/preloaded-catalog')
	@ApiOperation({
		summary:
			'Item Group - Manifest of the pre-loaded standard catalog. Returns the parent group + every category with a test-item count. Static data — no DB round-trip. Powers the "Import from pre-loaded" checklist in the frontend.',
	})
	async preloadedCatalog(@Res() res: Response) {
		try {
			return ApiResponseHelper.sendResponse(res, this.service.getPreloadedCatalog());
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}

	@Post('/import-preloaded')
	@ApiOperation({
		summary:
			'Item Group - Import the standard catalog (group + categories + test items) into the current tenant. When `category_codes` is provided, only those categories are installed. Idempotent — existing rows are skipped.',
	})
	@ApiBody({ type: ImportPreloadedCatalogDTO })
	async importPreloaded(
		@Res() res: Response,
		@Body() data: ImportPreloadedCatalogDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const actor = current?.name || current?.username || 'system';
			const out = await this.service.importPreloadedCatalog(tenant_uuid, actor, data.group_codes);
			return ApiResponseHelper.sendResponse(res, out, 'Catalog imported.');
		} catch (e: any) {
			return ApiResponseHelper.sendResponse(res, null, e?.message, e?.status ?? 500);
		}
	}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Item Group - Dashboard list.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: ItemGroupDashboardQueryDTO,
		@CurrentUser() current: any
	) {
		try {
			const scoped: ItemGroupDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Item Group - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Item group not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Item Group - Create' })
	@ApiBody({ type: CreateItemGroupDTO })
	async create(@Res() res: Response, @Body() data: CreateItemGroupDTO, @CurrentUser() current: any) {
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
				signatory_doctor_uuid: data.signatory_doctor_uuid,
				tester_role: data.tester_role,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Item group created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Item Group - Update' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateItemGroupDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateItemGroupDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item group not found.');
			assertOwns(current, existing);

			if (data.code && data.code !== existing.code) {
				if (await this.service.codeTaken(existing.tenant_uuid, data.code, uuid)) {
					return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists for this tenant.');
				}
			}

			const patch: any = { ...data, updated_by: current?.name || current?.username || 'system' };
			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Item group updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Item Group - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item group not found.');
			assertOwns(current, existing);

			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Item group deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Item Group - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetItemGroupStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetItemGroupStatusDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Item group not found.');
			assertOwns(current, existing);

			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Item group set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
