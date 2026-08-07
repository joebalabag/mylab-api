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

import { ExpenseService } from './expense.service';
import { Expense } from './expense.model';
import {
	CreateExpenseDTO,
	ExpenseDashboardQueryDTO,
	SetExpenseStatusDTO,
	UpdateExpenseDTO,
	VoidExpenseDTO,
} from './dto/expense.dto';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: Expense) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Expense belongs to a different tenant.');
}

function cashierCtx(current: any) {
	return {
		uuid: current?.type === 'user' ? current.uuid : null,
		name: current?.name || current?.username || 'system',
		username: current?.username || 'system',
	};
}

@ApiTags('Expense')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('expense')
export class ExpenseController {
	constructor(private readonly service: ExpenseService) {}

	@Get('/dashboard')
	@ApiOperation({
		summary:
			'Expense - Dashboard list. Admin can filter by tenant_uuid; user auto-scoped. Filters: user_uuid, category, date_transact range, created_at range, status[], keywords.',
	})
	async dashboard(
		@Res() res: Response,
		@Query() filters: ExpenseDashboardQueryDTO,
		@CurrentUser() current: any
	) {
		try {
			const scoped: ExpenseDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Expense - View one by uuid.' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Expense not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Expense - Create.' })
	@ApiBody({ type: CreateExpenseDTO })
	async create(@Res() res: Response, @Body() data: CreateExpenseDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');

			const created = await this.service.create({
				tenant_uuid,
				cashier: cashierCtx(current),
				dto: data,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Expense created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Expense - Update (active rows only).' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateExpenseDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateExpenseDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Expense not found.');
			assertOwns(current, existing);

			const updated = await this.service.update(
				uuid,
				existing.tenant_uuid,
				data,
				current?.name || current?.username || 'system'
			);
			return ApiResponseHelper.sendResponse(res, updated, 'Expense updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Expense - Set status (active | void).' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetExpenseStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetExpenseStatusDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Expense not found.');
			assertOwns(current, existing);

			const updated = await this.service.setStatus(
				uuid,
				data.status,
				current?.name || current?.username || 'system'
			);
			return ApiResponseHelper.sendResponse(res, updated, `Expense set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/void/:uuid')
	@ApiOperation({
		summary: 'Expense - Void. Records voided_at, voided_by, and reason for audit.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: VoidExpenseDTO })
	async void(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: VoidExpenseDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Expense not found.');
			assertOwns(current, existing);

			const updated = await this.service.void(uuid, existing.tenant_uuid, data, cashierCtx(current));
			return ApiResponseHelper.sendResponse(res, updated, 'Expense voided.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Expense - Hard delete.' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Expense not found.');
			assertOwns(current, existing);

			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Expense deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
