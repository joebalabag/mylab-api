import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { Tenant } from '@/app/tenant/tenant.model';
import { JwtPayload } from '@/app/auth/jwt.strategy';
import { SKIP_SUBSCRIPTION_CHECK_KEY } from '@/common/decorators/skip-subscription-check.decorator';

/**
 * Global guard. Blocks USER-token requests when the tenant's subscription is
 * inactive (`status !== 'active'`) OR the current subscription has lapsed
 * (`current_subscription_expiry <= now`). Admin tokens and public routes pass
 * through untouched.
 *
 * We parse the JWT ourselves via JwtService.verify() because global guards run
 * BEFORE controller-level guards, so `req.user` isn't populated yet.
 * `AuthGuard('jwt')` at the controller level still handles invalid/missing
 * tokens with a 401 as before — we just no-op here in that case.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly jwtService: JwtService,
	) {}

	async canActivate(ctx: ExecutionContext): Promise<boolean> {
		const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_CHECK_KEY, [
			ctx.getHandler(),
			ctx.getClass(),
		]);
		if (skip) return true;

		const req = ctx.switchToHttp().getRequest<Request>();
		const auth = req.headers['authorization'];
		if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
			// Public route (no token) — let it through. AuthGuard elsewhere handles
			// endpoints that require auth.
			return true;
		}

		let payload: JwtPayload;
		try {
			payload = this.jwtService.verify<JwtPayload>(auth.slice('Bearer '.length));
		} catch {
			// Malformed / expired JWT — defer to AuthGuard('jwt') to return 401
			// so the client gets a consistent auth-failure shape.
			return true;
		}

		if (payload.type !== 'user') return true;
		if (!payload.tenant_uuid) return true;

		const tenant = (await Tenant.query()
			.findOne({ uuid: payload.tenant_uuid })
			.select(
				'uuid',
				'status',
				'current_subscription_expiry',
				'current_subscription_plan_uuid',
			)) as Tenant | undefined;

		if (!tenant) {
			throw new ForbiddenException({
				message: 'subscription.tenant-missing',
				status: 403,
				response: null,
			});
		}

		if ((tenant.status || '').toLowerCase() !== 'active') {
			throw new ForbiddenException({
				message: 'subscription.tenant-inactive',
				status: 403,
				response: null,
			});
		}

		const expiry = tenant.current_subscription_expiry
			? new Date(tenant.current_subscription_expiry)
			: null;
		if (!expiry || expiry.getTime() <= Date.now()) {
			throw new ForbiddenException({
				message: 'subscription.expired',
				status: 403,
				response: null,
			});
		}

		return true;
	}
}
