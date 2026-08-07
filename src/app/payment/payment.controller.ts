import {
	Body,
	Controller,
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

import { PaymentService } from './payment.service';
import {
	CreatePaymentDTO,
	PaymentDashboardQueryDTO,
	ResolveArrangementDTO,
	UnpaidCasesQueryDTO,
	UnpaidItemsQueryDTO,
} from './dto/payment.dto';
import { Payment } from './payment.model';

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwns(current: any, existing: Payment) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Payment belongs to a different tenant.');
}

@ApiTags('Payment')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('payment')
export class PaymentController {
	constructor(private readonly service: PaymentService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Payment - Dashboard list. Filter by case, patient, method, date, status, keywords.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: PaymentDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const scoped: PaymentDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Payment - View by uuid (eager-loads items and joined case/patient identifiers).' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Payment not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/unpaid-cases')
	@ApiOperation({
		summary:
			'Payment - Cases with unpaid finalized (or partially_paid) requisition items. Powers the cashier "New Payment" search step.',
	})
	async unpaidCases(
		@Res() res: Response,
		@Query() filters: UnpaidCasesQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, filters.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const rows = await this.service.listUnpaidCases({ ...filters, tenant_uuid });
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/unpaid-items')
	@ApiOperation({ summary: 'Payment - Unpaid requisition items on a case (checklist for the payment form).' })
	async unpaidItems(
		@Res() res: Response,
		@Query() filters: UnpaidItemsQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, filters.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const rows = await this.service.listUnpaidItems({ ...filters, tenant_uuid });
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({
		summary:
			'Payment - Create. Atomic: inserts payment + payment_items, marks each requisition item paid, recomputes each affected requisition status (paid / partially_paid).',
	})
	@ApiBody({ type: CreatePaymentDTO })
	async create(@Res() res: Response, @Body() data: CreatePaymentDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}
			const created = await this.service.createPayment({
				...data,
				tenant_uuid,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Payment created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/resolve/:uuid')
	@ApiOperation({
		summary:
			'Payment - Resolve arrangement. Marks an A/R / insurance / paid-outside / other payment as actually settled, capturing the real method (cash / ewallet / bank_transfer) used to collect. Not applicable to cash / ewallet / bank_transfer (already collected), charity (self-resolving), or voided rows.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: ResolveArrangementDTO })
	async resolveArrangement(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: ResolveArrangementDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Payment not found.');
			assertOwns(current, existing);
			const out = await this.service.resolveArrangement(
				existing,
				data,
				current?.name || current?.username || 'system',
			);
			return ApiResponseHelper.sendResponse(res, out, 'Arrangement resolved.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/void/:uuid')
	@ApiOperation({
		summary:
			'Payment - Void. Flips the payment to status=voided, unpaws each of its items, and recomputes requisition statuses so unpaid items surface again.',
	})
	@ApiParam({ name: 'uuid', required: true })
	async voidPayment(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Payment not found.');
			assertOwns(current, existing);
			const out = await this.service.voidPayment(existing, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, out, 'Payment voided.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
