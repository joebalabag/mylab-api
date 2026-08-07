import { Module } from '@nestjs/common';
import { TenantSubscriptionPaymentController } from './tenant-subscription-payment.controller';
import { PublicPaypalWebhookController } from './public-paypal-webhook.controller';
import { TenantSubscriptionPaymentService } from './tenant-subscription-payment.service';
import { TenantSubscriptionPaymentCron } from './tenant-subscription-payment.cron';
import { PaymentExtractionService } from './payment-extraction.service';

@Module({
	controllers: [TenantSubscriptionPaymentController, PublicPaypalWebhookController],
	providers: [TenantSubscriptionPaymentService, TenantSubscriptionPaymentCron, PaymentExtractionService],
	exports: [TenantSubscriptionPaymentService, PaymentExtractionService],
})
export class TenantSubscriptionPaymentModule {}
