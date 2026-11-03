import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuditRequestInfo {
	ip: string | null;
	userAgent: string | null;
}

/**
 * Extracts the client IP (honoring X-Forwarded-For when behind nginx/PM2)
 * and User-Agent for audit logging. Mirrors the one-shot extraction done
 * inline in auth.controller.ts:239 so every auditable controller can grab
 * the same shape with one argument.
 */
export const AuditRequest = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuditRequestInfo => {
	const req = ctx.switchToHttp().getRequest();
	const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
	const ip = forwarded || req.socket?.remoteAddress || null;
	const ua = (req.headers['user-agent'] as string | undefined) || null;
	return { ip, userAgent: ua };
});
