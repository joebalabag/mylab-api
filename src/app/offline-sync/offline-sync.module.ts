import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PatientModule } from '../patient/patient.module';
import { PatientCaseModule } from '../patient-case/patient-case.module';
import { PaymentModule } from '../payment/payment.module';
import { LabReportModule } from '../lab-report/lab-report.module';

import { OfflineSyncController } from './offline-sync.controller';
import { OfflineSyncService } from './offline-sync.service';
import { SyncDispatcherService } from './sync-dispatcher.service';
import { IdempotencyService } from './idempotency.service';

@Module({
	// AuthModule re-exports JwtModule — that's how OfflineSyncService gets a
	// JwtService without configuring a separate one (would risk drifting from
	// the app-wide secret / expiry defaults).
	imports: [AuthModule, PatientModule, PatientCaseModule, PaymentModule, LabReportModule],
	controllers: [OfflineSyncController],
	providers: [OfflineSyncService, SyncDispatcherService, IdempotencyService],
	exports: [OfflineSyncService],
})
export class OfflineSyncModule {}
