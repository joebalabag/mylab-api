import { Module } from '@nestjs/common';
import { UserAccessController } from './user-access.controller';
import { UserAccessService } from './user-access.service';

@Module({
	controllers: [UserAccessController],
	providers: [UserAccessService],
	exports: [UserAccessService],
})
export class UserAccessModule {}
