import { Module } from '@nestjs/common';
import { SetupReadinessController } from './setup-readiness.controller';
import { SetupReadinessService } from './setup-readiness.service';

@Module({
	controllers: [SetupReadinessController],
	providers: [SetupReadinessService],
})
export class SetupReadinessModule {}
