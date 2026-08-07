import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { SkipSubscriptionCheck } from '@/common/decorators/skip-subscription-check.decorator';
import { MailerService } from '@/common/mailer/mailer.service';
import { SendTestMailDTO } from './dto/mail-test.dto';

@ApiTags('Mail Test')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('mail')
export class MailTestController {
	constructor(private readonly mailer: MailerService) {}

	@Post('/test')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Send a test email using the currently configured SMTP settings (any authenticated token). When SMTP env vars are blank, the mailer logs to server console instead of actually sending — useful for local dev.',
	})
	@ApiBody({ type: SendTestMailDTO })
	async sendTest(@Res() res: Response, @Body() data: SendTestMailDTO) {
		try {
			const subject = data.subject ?? 'MyLab — test email';
			const message = data.message ?? 'Hello from mylab-api. If you can read this, SMTP is working.';
			const sent_at = new Date();

			await this.mailer.sendTemplate(data.to, 'test', {
				subject,
				message,
				sent_at: sent_at.toISOString(),
			});

			return ApiResponseHelper.sendResponse(
				res,
				{ to: data.to, subject, sent_at },
				'Test email dispatched. If SMTP is not configured it was logged to the server console.',
			);
		} catch (error: any) {
			console.log(error);
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
