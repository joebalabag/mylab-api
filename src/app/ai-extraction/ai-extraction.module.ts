import { Module } from '@nestjs/common';
import { TenantSubscriptionPaymentModule } from '../tenant-subscription-payment/tenant-subscription-payment.module';
import { AiExtractionController } from './ai-extraction.controller';

@Module({
	imports: [TenantSubscriptionPaymentModule], // for PaymentExtractionService
	controllers: [AiExtractionController],
})
export class AiExtractionModule {}
