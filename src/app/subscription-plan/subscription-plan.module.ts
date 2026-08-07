import { Module } from '@nestjs/common';
import { SubscriptionPlanController } from './subscription-plan.controller';
import { PublicSubscriptionPlanController } from './public-subscription-plan.controller';
import { SubscriptionPlanService } from './subscription-plan.service';

@Module({
	controllers: [SubscriptionPlanController, PublicSubscriptionPlanController],
	providers: [SubscriptionPlanService],
	exports: [SubscriptionPlanService],
})
export class SubscriptionPlanModule {}
