import { Module } from '@nestjs/common';
import { MailerModule } from '@/common/mailer/mailer.module';
import { AuthModule } from '../auth/auth.module';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantMigrationService } from './tenant-migration.service';

@Module({
	imports: [MailerModule, AuthModule],
	controllers: [TenantController],
	providers: [TenantService, TenantMigrationService],
	exports: [TenantService],
})
export class TenantModule {}
