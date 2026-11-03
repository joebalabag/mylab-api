import { Global, Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { AuditService } from './audit-log.service';
import { AuditLogCron } from './audit-log.cron';

/**
 * Global so the AuditService singleton is reachable from every feature module
 * without an explicit `imports: [AuditLogModule]`. The service installs itself
 * as a static singleton via its constructor so Objection model lifecycle
 * hooks — which run outside Nest's DI container — can call it.
 */
@Global()
@Module({
	controllers: [AuditLogController],
	providers: [AuditService, AuditLogCron],
	exports: [AuditService],
})
export class AuditLogModule {}
