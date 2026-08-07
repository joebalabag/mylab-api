import { Module } from '@nestjs/common';
import { PatientCaseController } from './patient-case.controller';
import { PatientCaseService } from './patient-case.service';

@Module({
	controllers: [PatientCaseController],
	providers: [PatientCaseService],
	exports: [PatientCaseService],
})
export class PatientCaseModule {}
