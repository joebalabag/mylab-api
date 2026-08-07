import { Body, Controller, Headers, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { TenantSubscriptionPaymentService } from './tenant-subscription-payment.service';

/**
 * Public PayPal webhook receiver.
 *
 * Kept in its own controller with no JWT guard so the JWT check on the main
 * controller doesn't accidentally leak onto this route — PayPal calls this
 * without any bearer token.
 *
 * PayPal expects a 2xx response within ~10s; anything else queues a retry.
 * The service returns { handled, reason } instead of throwing precisely so
 * we can always return 200: handled=true means we ack, handled=false with a
 * meaningful reason (already processed, ignored event, signature invalid)
 * also returns 200 so PayPal stops retrying. If the DB is down or verify
 * throws, that error will propagate and become a 500 — PayPal will retry,
 * which is what we want.
 */
@ApiTags('Public - PayPal Webhook')
@UseGuards(ThrottlerGuard)
@Controller('public/paypal')
export class PublicPaypalWebhookController {
	constructor(private readonly service: TenantSubscriptionPaymentService) {}

	@Post('/webhook')
	@Throttle({ default: { limit: 120, ttl: 60_000 } })
	@ApiOperation({
		summary:
			'Public - Receive a PayPal webhook. Verifies signature server-to-server; on PAYMENT.CAPTURE.COMPLETED, captures the order and auto-activates the tenant subscription (idempotent with the browser capture path).',
	})
	async webhook(
		@Res() res: Response,
		@Headers() headers: Record<string, any>,
		@Body() body: any,
	) {
		try {
			const outcome = await this.service.handlePaypalWebhookEvent(headers, body);
			// Always 200 — see class comment.
			return ApiResponseHelper.sendResponse(res, outcome, outcome.handled ? 'ok' : `dropped:${outcome.reason}`, 200);
		} catch (error: any) {
			// Only unexpected exceptions (DB down, verify network error) reach
			// here. Return non-2xx so PayPal retries.
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
