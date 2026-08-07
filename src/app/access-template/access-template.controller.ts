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

import { AccessTemplateService } from './access-template.service';
import {
	AccessTemplateDashboardQueryDTO,
	CreateAccessTemplateDTO,
	UpdateAccessTemplateDTO,
} from './dto/access-template.dto';

function requireAdmin(current: any) {
	if (current?.type !== 'admin') throw new ForbiddenException('Admin token required.');
}

@ApiTags('Access Template')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('access-template')
export class AccessTemplateController {
	constructor(private readonly service: AccessTemplateService) {}

	@Get('/dashboard')
	@ApiOperation({
		summary:
			'Access Template - Dashboard list (any authenticated token). Ordered by navigation_id. Filters: catalog, main_navigation, has_access, date range, keywords, pagination.',
	})
	async dashboard(
		@Res() res: Response,
		@Query() filters: AccessTemplateDashboardQueryDTO,
		@CurrentUser() _current: any,
	) {
		try {
			const output = await this.service.listDashboard(filters);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/view/:uuid')
	@ApiOperation({ summary: 'Access Template - View by uuid (admin only).' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			requireAdmin(current);
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Access template row not found.');
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({
		summary:
			'Access Template - Create a new permission node (admin only). Fails if navigation_id or (catalog, main_navigation, sub_navigation) already exists.',
	})
	@ApiBody({ type: CreateAccessTemplateDTO })
	async create(
		@Res() res: Response,
		@Body() data: CreateAccessTemplateDTO,
		@CurrentUser() current: any,
	) {
		try {
			requireAdmin(current);

			if (await this.service.navigationIdTaken(data.navigation_id)) {
				return ApiResponseHelper.sendAlreadyExist(res, 'navigation_id already exists.');
			}
			if (await this.service.tripleTaken(data.catalog, data.main_navigation, data.sub_navigation)) {
				return ApiResponseHelper.sendAlreadyExist(
					res,
					'A row with the same catalog / main_navigation / sub_navigation already exists.',
				);
			}

			const created = await this.service.create({
				...data,
				created_by: current?.name || current?.username || 'admin',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Access template row created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({
		summary:
			'Access Template - Update (admin only). Any subset of fields; uniqueness checks run when the identifying fields change.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateAccessTemplateDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateAccessTemplateDTO,
		@CurrentUser() current: any,
	) {
		try {
			requireAdmin(current);

			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Access template row not found.');

			if (data.navigation_id != null && data.navigation_id !== existing.navigation_id) {
				if (await this.service.navigationIdTaken(data.navigation_id, uuid)) {
					return ApiResponseHelper.sendAlreadyExist(res, 'navigation_id already exists.');
				}
			}

			const nextCatalog = data.catalog ?? existing.catalog;
			const nextMain = data.main_navigation ?? existing.main_navigation;
			const nextSub = data.sub_navigation ?? existing.sub_navigation;
			const tripleChanged =
				nextCatalog !== existing.catalog ||
				nextMain !== existing.main_navigation ||
				nextSub !== existing.sub_navigation;
			if (tripleChanged) {
				if (await this.service.tripleTaken(nextCatalog, nextMain, nextSub, uuid)) {
					return ApiResponseHelper.sendAlreadyExist(
						res,
						'A row with the same catalog / main_navigation / sub_navigation already exists.',
					);
				}
			}

			const updated = await this.service.update(uuid, {
				...data,
				updated_by: current?.name || current?.username || 'admin',
			} as any);
			return ApiResponseHelper.sendResponse(res, updated, 'Access template row updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Access Template - Delete (admin only).' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			requireAdmin(current);
			const { count } = await this.service.delete(uuid);
			if (!count) return ApiResponseHelper.sendNotFound(res, 'Access template row not found.');
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Access template row deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
