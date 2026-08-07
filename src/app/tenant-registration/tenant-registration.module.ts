import { Module } from '@nestjs/common';
import { TenantRegistrationController } from './tenant-registration.controller';
import { TenantRegistrationService } from './tenant-registration.service';

@Module({
	controllers: [TenantRegistrationController],
	providers: [TenantRegistrationService],
})
export class TenantRegistrationModule {}
