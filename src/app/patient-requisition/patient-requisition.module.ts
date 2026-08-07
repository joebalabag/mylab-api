import { Module } from '@nestjs/common';
import { PatientRequisitionController } from './patient-requisition.controller';
import { PatientRequisitionService } from './patient-requisition.service';

@Module({
	controllers: [PatientRequisitionController],
	providers: [PatientRequisitionService],
	exports: [PatientRequisitionService],
})
export class PatientRequisitionModule {}
