import { Module } from '@nestjs/common';
import { PatientCaseController } from './patient-case.controller';
import { PatientCaseService } from './patient-case.service';
import { PatientCaseCron } from './patient-case.cron';

@Module({
	controllers: [PatientCaseController],
	providers: [PatientCaseService, PatientCaseCron],
	exports: [PatientCaseService],
})
export class PatientCaseModule {}
