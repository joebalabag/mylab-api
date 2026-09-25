import { Global, Module } from '@nestjs/common';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

@Global()
@Module({
	providers: [PresenceService],
	controllers: [PresenceController],
	exports: [PresenceService],
})
export class PresenceModule {}
