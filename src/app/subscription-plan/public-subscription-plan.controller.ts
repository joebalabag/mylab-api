import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { SubscriptionPlanService } from './subscription-plan.service';

/**
 * Public (unauthenticated) subscription-plan endpoints used by the register
 * page. Kept separate from SubscriptionPlanController so the JWT guard on
 * that controller doesn't accidentally leak onto public routes.
 */
@ApiTags('Public - Subscription Plan')
@UseGuards(ThrottlerGuard)
@Controller('public/subscription-plan')
export class PublicSubscriptionPlanController {
	constructor(private readonly service: SubscriptionPlanService) {}

	@Get('/trials')
	@Throttle({ default: { limit: 30, ttl: 60_000 } })
	@ApiOperation({
		summary:
			'Public - List active trial (free) subscription plans offered on the register page. Returns minimal fields (uuid, code, name, price, days_duration, features, allowed_modules, max_terminals). Rate-limited.',
	})
	async listTrials(@Res() res: Response) {
		try {
			const rows = await this.service.listPublicTrials();
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/list')
	@Throttle({ default: { limit: 60, ttl: 60_000 } })
	@ApiOperation({
		summary:
			'Public - List all active subscription plans (trial + paid) for the marketing landing page. Returns the same fields as /trials plus is_trial so the UI can badge free plans. QR / payee / audit fields are intentionally omitted. Rate-limited.',
	})
	async listAll(@Res() res: Response) {
		try {
			const rows = await this.service.listPublicPlans();
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
