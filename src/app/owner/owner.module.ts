import { forwardRef, Module } from '@nestjs/common';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';

@Module({
	// forwardRef on TenantModule — see tenant.module.ts for the cycle note.
	// UserModule is clean (UserService has no inbound Owner dep).
	imports: [AuthModule, forwardRef(() => TenantModule), UserModule],
	controllers: [OwnerController],
	providers: [OwnerService],
	exports: [OwnerService],
})
export class OwnerModule {}
