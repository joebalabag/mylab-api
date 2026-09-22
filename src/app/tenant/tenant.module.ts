import { Module } from '@nestjs/common';
import { MailerModule } from '@/common/mailer/mailer.module';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
	imports: [MailerModule],
	controllers: [TenantController],
	providers: [TenantService],
	exports: [TenantService],
})
export class TenantModule {}
