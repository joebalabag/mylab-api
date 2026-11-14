import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { OwnerModule } from '../owner/owner.module';
import { MailerModule } from '@/common/mailer/mailer.module';
import { LabReportAuthedController, LabReportController } from './lab-report.controller';
import { LabReportService } from './lab-report.service';

@Module({
	// OwnerModule is clean (no inbound LabReport dep) so a direct import —
	// LabReportService uses OwnerService.ownsTenant / listOwnedTenantUuids
	// for the Phase 3 branch search + audit flow.
	imports: [UserModule, MailerModule, OwnerModule],
	controllers: [LabReportController, LabReportAuthedController],
	providers: [LabReportService],
	exports: [LabReportService],
})
export class LabReportModule {}
