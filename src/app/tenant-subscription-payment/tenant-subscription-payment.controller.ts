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
import { SkipSubscriptionCheck } from '@/common/decorators/skip-subscription-check.decorator';

import { TenantSubscriptionPaymentService } from './tenant-subscription-payment.service';
import {
	ApproveSubscriptionPaymentDTO,
	CapturePaypalOrderDTO,
	CreatePaypalOrderDTO,
	RejectSubscriptionPaymentDTO,
	SubscriptionPaymentDashboardQueryDTO,
	UploadSubscriptionPaymentDTO,
} from './dto/tenant-subscription-payment.dto';
import { TenantSubscriptionPayment } from './tenant-subscription-payment.model';

function requireAdmin(current: any) {
	if (current?.type !== 'admin') throw new ForbiddenException('Admin token required.');
}

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}

function assertOwnsPayment(current: any, existing: TenantSubscriptionPayment) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Payment belongs to a different tenant.');
}

@ApiTags('Tenant Subscription Payment')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('tenant-subscription-payment')
export class TenantSubscriptionPaymentController {
	constructor(private readonly service: TenantSubscriptionPaymentService) {}

	@Get('/dashboard')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Dashboard list. Admin: cross-tenant. User: auto-scoped to own tenant. Filters: tenant_uuid, payment_status, date range, keywords, pagination.',
	})
	async dashboard(
		@Res() res: Response,
		@Query() filters: SubscriptionPaymentDashboardQueryDTO,
		@CurrentUser() current: any
	) {
		try {
			const scoped: SubscriptionPaymentDashboardQueryDTO = {
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
	@SkipSubscriptionCheck()
	@ApiOperation({ summary: 'View payment record.' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Payment not found.');
			assertOwnsPayment(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/upload')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Submit a subscription-payment record. JSON body — the receipt file was previously uploaded via POST /api/ai-extraction/receipt; pass its `payment_attachment_url` here along with the tenant-adjusted extraction fields and `amount_paid`.',
	})
	@ApiBody({ type: UploadSubscriptionPaymentDTO })
	async upload(
		@Res() res: Response,
		@Body() data: UploadSubscriptionPaymentDTO,
		@CurrentUser() current: any
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');

			const { payment, warnings } = await this.service.upload({
				tenant_uuid,
				subscription_plan_uuid: data.subscription_plan_uuid,
				amount_paid: data.amount_paid,
				payment_attachment_url: data.payment_attachment_url,
				payment_reference_number: data.payment_reference_number,
				payee_account_number: data.payee_account_number,
				payment_method: data.payment_method,
				payment_method_name: data.payment_method_name,
				payment_datetime: data.payment_datetime,
				ai_extraction: data.ai_extraction,
				created_by: current?.name || current?.username || 'system',
			});

			return ApiResponseHelper.sendResponse(res, payment, 'Payment uploaded (pending approval).', 200, warnings);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/approve/:uuid')
	@ApiOperation({
		summary:
			'Approve payment (admin only). If the tenant has no active plan (or it has expired), activates immediately and updates tenants.current_* fields. If the tenant has an active plan with 5 days or fewer remaining, the new plan is queued as a "scheduled" history row that starts at the current expiry — it is auto-promoted to active by an hourly cron (or lazily on next login/approve). Rejects when the current plan has more than 5 days left, or when a scheduled subscription already exists for the tenant.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: ApproveSubscriptionPaymentDTO })
	async approve(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: ApproveSubscriptionPaymentDTO,
		@CurrentUser() current: any
	) {
		try {
			requireAdmin(current);
			const output = await this.service.approve({
				uuid,
				approved_by_uuid: current.uuid,
				approved_by_name: current?.name || current?.username || 'admin',
				subscription_start: data.subscription_start,
			});
			const message =
				output.activation_mode === 'immediate'
					? 'Payment approved. Subscription activated.'
					: `Payment approved. Subscription scheduled to activate on ${output.subscription_start.toISOString()}.`;
			const { warnings, ...responseBody } = output;
			return ApiResponseHelper.sendResponse(res, responseBody, message, 200, warnings);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/paypal/create-order')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Create a PayPal Order for the tenant to pay a specific plan. Returns { order_id, amount, currency }. The frontend passes order_id to the PayPal Smart Button; onApprove then calls /paypal/capture-order.',
	})
	@ApiBody({ type: CreatePaypalOrderDTO })
	async paypalCreateOrder(
		@Res() res: Response,
		@Body() data: CreatePaypalOrderDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const out = await this.service.createPaypalOrder({
				tenant_uuid,
				subscription_plan_uuid: data.subscription_plan_uuid,
			});
			return ApiResponseHelper.sendResponse(res, out);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/paypal/capture-order')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Capture a previously-created PayPal Order. Verifies the captured amount matches the plan price, records the payment, and auto-activates (or schedules) the subscription. Idempotent — safe to retry.',
	})
	@ApiBody({ type: CapturePaypalOrderDTO })
	async paypalCaptureOrder(
		@Res() res: Response,
		@Body() data: CapturePaypalOrderDTO,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			const out = await this.service.capturePaypalOrder({
				tenant_uuid,
				order_id: data.order_id,
				invoked_by: current?.name || current?.username || 'user',
			});
			const message =
				out.activation_mode === 'immediate'
					? 'Payment captured. Subscription activated.'
					: out.activation_mode === 'scheduled'
						? `Payment captured. Subscription scheduled to activate on ${out.subscription_start?.toISOString()}.`
						: 'Payment captured (already processed).';
			const { warnings, ...responseBody } = out;
			return ApiResponseHelper.sendResponse(res, responseBody, message, 200, warnings);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/reject/:uuid')
	@ApiOperation({ summary: 'Reject payment (admin only).' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: RejectSubscriptionPaymentDTO })
	async reject(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: RejectSubscriptionPaymentDTO,
		@CurrentUser() current: any
	) {
		try {
			requireAdmin(current);
			const { payment, warnings } = await this.service.reject({
				uuid,
				rejection_reason: data.rejection_reason,
				rejected_by_uuid: current.uuid,
				rejected_by_name: current?.name || current?.username || 'admin',
			});
			return ApiResponseHelper.sendResponse(res, payment, 'Payment rejected.', 200, warnings);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
