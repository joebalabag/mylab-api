import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
	protected async throwThrottlingException(): Promise<void> {
		throw new ThrottlerException('Too many requests. Please wait a minute and try again.');
	}
}
