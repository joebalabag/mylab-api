import { Module } from '@nestjs/common';
import { TenantSubscriptionHistoryController } from './tenant-subscription-history.controller';
import { TenantSubscriptionHistoryService } from './tenant-subscription-history.service';

@Module({
	controllers: [TenantSubscriptionHistoryController],
	providers: [TenantSubscriptionHistoryService],
	exports: [TenantSubscriptionHistoryService],
})
export class TenantSubscriptionHistoryModule {}
