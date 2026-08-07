import { Body, Controller, Logger, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { TenantRegistrationService } from './tenant-registration.service';
import {
	RegisterTenantDTO,
	ResendVerificationDTO,
	VerifyTenantRegistrationDTO,
} from './dto/tenant-registration.dto';

@ApiTags('Public - Tenant Registration')
@UseGuards(ThrottlerGuard)
@Controller('public/tenant')
export class TenantRegistrationController {
	private readonly logger = new Logger(TenantRegistrationController.name);

	constructor(private readonly service: TenantRegistrationService) {}

	@Post('/register')
	@Throttle({ login: { limit: 5, ttl: 60_000 } })
	@ApiOperation({
		summary:
			'Public - Register a new tenant (14-day trial). Creates a pending tenant and a pending admin user, then emails a verification link. Rate-limited to 5 per minute per IP.',
	})
	@ApiBody({ type: RegisterTenantDTO })
	async register(@Res() res: Response, @Body() data: RegisterTenantDTO) {
		try {
			const out = await this.service.register(data);
			return ApiResponseHelper.sendResponse(
				res,
				out,
				'Registration received. Check your inbox for the verification email.',
			);
		} catch (error: any) {
			this.logger.error(`register failed: ${error?.message}`, error?.stack);
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/verify')
	@Throttle({ login: { limit: 5, ttl: 60_000 } })
	@ApiOperation({
		summary:
			'Public - Consume the verification token from the email. Activates the tenant + admin user, assigns the TRIAL plan, grants full access to the admin, and emails a welcome message. Rate-limited.',
	})
	@ApiBody({ type: VerifyTenantRegistrationDTO })
	async verify(@Res() res: Response, @Body() data: VerifyTenantRegistrationDTO) {
		try {
			const out = await this.service.verify(data.token);
			return ApiResponseHelper.sendResponse(res, out, 'Account activated. Credentials emailed to the owner.');
		} catch (error: any) {
			this.logger.error(`verify failed: ${error?.message}`, error?.stack);
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/resend-verification')
	@Throttle({ login: { limit: 5, ttl: 60_000 } })
	@ApiOperation({
		summary:
			'Public - Resend the verification email for a pending account. Always returns success (does not leak account existence). Rate-limited.',
	})
	@ApiBody({ type: ResendVerificationDTO })
	async resend(@Res() res: Response, @Body() data: ResendVerificationDTO) {
		try {
			await this.service.resendVerification(data.contact_email);
			return ApiResponseHelper.sendResponse(res, { ok: true }, 'If the account exists, a new email has been sent.');
		} catch (error: any) {
			this.logger.error(`resend-verification failed: ${error?.message}`, error?.stack);
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
