import { Module } from '@nestjs/common';
import { LabReportAuthedController, LabReportController } from './lab-report.controller';
import { LabReportService } from './lab-report.service';

@Module({
	controllers: [LabReportController, LabReportAuthedController],
	providers: [LabReportService],
	exports: [LabReportService],
})
export class LabReportModule {}
