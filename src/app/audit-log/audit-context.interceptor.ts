import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { actorFromCurrent } from './audit-context';
import { runWithAuditStore } from './audit-als';

/**
 * Wraps every HTTP request in an AsyncLocalStorage frame carrying the acting
 * user + request metadata. Audit model hooks running later in the same async
 * chain read this to populate `audit_logs.actor_*` without the service layer
 * having to pass `.context({...})` on every query.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
	intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
		const req = ctx.switchToHttp().getRequest();
		const forwarded = (req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
		const ip = forwarded || req?.socket?.remoteAddress || null;
		const ua = (req?.headers?.['user-agent'] as string | undefined) || null;

		const store = {
			actor: actorFromCurrent(req?.user),
			request: { ip, userAgent: ua },
		};

		// als.run must enclose the subscription itself for the AsyncLocalStorage
		// frame to propagate through every awaited microtask the handler kicks off.
		return runWithAuditStore(store, () => next.handle());
	}
}
