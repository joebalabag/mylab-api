import { forwardRef, Module } from '@nestjs/common';
import { MailerModule } from '@/common/mailer/mailer.module';
import { AuthModule } from '../auth/auth.module';
import { OwnerModule } from '../owner/owner.module';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantMigrationService } from './tenant-migration.service';

@Module({
	// OwnerModule ↔ TenantModule are mutually dependent (tenant endpoints
	// need OwnerService for the Owner column + Assign-to-Owner auto-wire,
	// and OwnerController needs TenantMigrationService for owner-driven
	// catalog migrations). forwardRef lets Nest settle the DI graph in
	// two passes.
	imports: [MailerModule, AuthModule, forwardRef(() => OwnerModule)],
	controllers: [TenantController],
	providers: [TenantService, TenantMigrationService],
	exports: [TenantService, TenantMigrationService],
})
export class TenantModule {}
