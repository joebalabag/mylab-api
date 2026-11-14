import { Module } from '@nestjs/common';
import { OwnerModule } from '../owner/owner.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
	// OwnerModule is clean (no inbound Reports dep), so a direct import — no
	// forwardRef needed. We inject OwnerService into ReportsController to
	// validate that an owner token truly owns the requested tenant_uuid.
	imports: [OwnerModule],
	controllers: [ReportsController],
	providers: [ReportsService],
})
export class ReportsModule {}
