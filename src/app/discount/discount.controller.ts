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

import { DiscountService } from './discount.service';
import {
	CreateDiscountDTO,
	DiscountDashboardQueryDTO,
	SetDiscountStatusDTO,
	UpdateDiscountDTO,
} from './dto/discount.dto';
import { Discount } from './discount.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwnsDiscount(current: any, existing: Discount) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Discount belongs to a different tenant.');
}

@ApiTags('Discount')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('discount')
export class DiscountController {
	constructor(private readonly service: DiscountService) {}

	@Get('/dashboard')
	@ApiOperation({
		summary:
			'Discount - Dashboard list. Admin can filter by tenant_uuid; user is auto-scoped to own tenant. Filters: discount_type, date range, status[], keywords, pagination.',
	})
	async dashboard(
		@Res() res: Response,
		@Query() filters: DiscountDashboardQueryDTO,
		@CurrentUser() current: any
	) {
		try {
			const scoped: DiscountDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Discount - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Discount not found.');
			assertOwnsDiscount(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Discount - Create' })
	@ApiBody({ type: CreateDiscountDTO })
	async create(@Res() res: Response, @Body() data: CreateDiscountDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) {
				return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			}

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
				discount_type: data.discount_type,
				value: data.value,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Discount created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Discount - Update' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateDiscountDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateDiscountDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Discount not found.');
			assertOwnsDiscount(current, existing);

			if (data.code && data.code !== existing.code) {
				if (await this.service.codeTaken(existing.tenant_uuid, data.code, uuid)) {
					return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists for this tenant.');
				}
			}

			const patch: any = { ...data, updated_by: current?.name || current?.username || 'system' };
			// If switching to (or already is) open_amount, force value to 0
			const nextType = (data.discount_type ?? existing.discount_type) as string;
			if (nextType === 'open_amount') patch.value = 0;

			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Discount updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Discount - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Discount not found.');
			assertOwnsDiscount(current, existing);

			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Discount deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Discount - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetDiscountStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetDiscountStatusDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Discount not found.');
			assertOwnsDiscount(current, existing);

			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Discount set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
