import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TenantSubscriptionPaymentModule } from '../tenant-subscription-payment/tenant-subscription-payment.module';
import { UserAccessModule } from '../user-access/user-access.module';

@Module({
	imports: [
		PassportModule,
		JwtModule.register({
			secret: process.env.JWT_SECRET || 'super-secret-change-me',
			signOptions: {
				expiresIn: (process.env.JWT_EXPIRES_IN || '1d') as any,
			},
		}),
		TenantSubscriptionPaymentModule,
		UserAccessModule,
	],
	controllers: [AuthController],
	providers: [AuthService, JwtStrategy],
	exports: [AuthService, JwtModule],
})
export class AuthModule {}
