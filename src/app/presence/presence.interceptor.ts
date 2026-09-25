import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PresenceService } from './presence.service';
import { extractClientIp, extractUserAgent } from './request-meta';

/**
 * Global interceptor that stamps req.user in the PresenceService on every
 * authenticated HTTP request. Public routes leave req.user undefined and
 * are silently skipped — the dedicated /presence/heartbeat endpoint is
 * what keeps idle sessions alive.
 */
@Injectable()
export class PresenceInterceptor implements NestInterceptor {
	constructor(private readonly presence: PresenceService) {}

	intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
		if (ctx.getType() !== 'http') return next.handle();
		const req = ctx.switchToHttp().getRequest();
		const user = req?.user;
		if (user?.uuid) {
			this.presence.touch({
				uuid: user.uuid,
				username: user.username,
				name: user.name,
				tenant_uuid: user.tenant_uuid,
				role: user.role,
				type: user.type,
				ip: extractClientIp(req),
				user_agent: extractUserAgent(req),
			});
		}
		return next.handle();
	}
}
