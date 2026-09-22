import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { MailerModule } from '@/common/mailer/mailer.module';
import { LabReportAuthedController, LabReportController } from './lab-report.controller';
import { LabReportService } from './lab-report.service';

@Module({
	imports: [UserModule, MailerModule],
	controllers: [LabReportController, LabReportAuthedController],
	providers: [LabReportService],
	exports: [LabReportService],
})
export class LabReportModule {}
