import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { OfflineDevice } from '@/app/offline-sync/offline-device.model';
import { Tenant } from '@/app/tenant/tenant.model';
import { ALLOW_OFFLINE_TOKEN_KEY } from '@/common/decorators/allow-offline-token.decorator';

/**
 * Fires AFTER `AuthGuard('jwt')` (`req.user` is populated). Two jobs:
 *   1. If the caller is on an offline token but the route is NOT marked with
 *      @AllowOfflineToken(), reject with 403. Offline stations must not be
 *      able to hit admin or write-outside-scope endpoints even if their
 *      still-valid token would technically pass JWT verification.
 *   2. If the caller IS on an offline token, verify the tenant is still
 *      opted into offline mode and the underlying device row is not revoked.
 *      This is the enforcement point for admin "revoke device" — the revoked
 *      JWT stays syntactically valid until expiry, but this guard blocks it.
 */
@Injectable()
export class OfflineTokenGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	async canActivate(ctx: ExecutionContext): Promise<boolean> {
		const req = ctx.switchToHttp().getRequest<Request & { user?: any }>();
		const user = req.user;

		// No user (public route) or online user token — nothing to check.
		if (!user || user.offline !== true) return true;

		const allow = this.reflector.getAllAndOverride<boolean>(ALLOW_OFFLINE_TOKEN_KEY, [
			ctx.getHandler(),
			ctx.getClass(),
		]);
		if (!allow) {
			throw new ForbiddenException('Offline station tokens are not accepted on this endpoint.');
		}

		if (!user.tenant_uuid) throw new ForbiddenException('Offline token missing tenant_uuid.');
		if (!user.device_id) throw new ForbiddenException('Offline token missing device_id.');

		const tenant = (await Tenant.query().findById(user.tenant_uuid)) as unknown as Tenant | undefined;
		if (!tenant) throw new ForbiddenException('Tenant not found.');
		if (!(tenant as any).offline_mode_enabled) {
			throw new ForbiddenException('Offline mode is no longer enabled for this tenant.');
		}

		const device = (await OfflineDevice.query().findOne({
			tenant_uuid: user.tenant_uuid,
			device_id: user.device_id,
		})) as unknown as OfflineDevice | undefined;
		if (!device) throw new ForbiddenException('Offline device not registered.');
		if (device.revoked_at) throw new ForbiddenException('Offline device has been revoked.');

		return true;
	}
}
