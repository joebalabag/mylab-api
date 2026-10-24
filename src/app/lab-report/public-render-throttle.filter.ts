import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';
import * as ejs from 'ejs';
import * as path from 'path';

/**
 * Serves a friendly HTML 429 page when the public HTML lab-report endpoint
 * (/lab-report/public/render) trips the throttler. The recipient is a
 * non-technical patient, so the default JSON `{statusCode:429,message:...}`
 * is confusing — we render the same visual language as the success page
 * with "wait a minute and try again" messaging instead.
 *
 * The JSON twin (/lab-report/public/view) is intentionally left alone so
 * API clients still get the structured error.
 */
@Catch(ThrottlerException)
export class PublicRenderThrottleFilter implements ExceptionFilter {
	private readonly logger = new Logger(PublicRenderThrottleFilter.name);

	async catch(exception: ThrottlerException, host: ArgumentsHost): Promise<void> {
		const ctx = host.switchToHttp();
		const req = ctx.getRequest<Request>();
		const res = ctx.getResponse<Response>();

		// Only wrap the HTML endpoint; let the JSON endpoint fall through to
		// Nest's default handler so API clients still get { statusCode, message }.
		// Global prefix is `/api`, so the full path is `/api/lab-report/public/render`.
		const url = req.originalUrl || req.url || req.path || '';
		const isHtml = url.includes('/lab-report/public/render');
		if (!isHtml) throw exception;

		let body: string;
		let contentType = 'text/html; charset=utf-8';
		try {
			const templatePath = path.join(__dirname, 'templates', 'public-lab-report-rate-limit.ejs');
			body = await ejs.renderFile(templatePath, {}, { async: true });
		} catch (err: any) {
			// Rendering the friendly page itself failed — fall back to a plain
			// 429 so the recipient at least sees *something*.
			this.logger.warn(`Failed to render throttle page: ${err?.message}`);
			body = 'Too many requests. Please wait a minute and try again.';
			contentType = 'text/plain; charset=utf-8';
		}

		// Write directly via Node's raw ServerResponse so Nest / morgan / anything
		// else chaining on top of Express can't downgrade the Content-Type back
		// to text/plain. Express's `res.type()` was leaving the header unset in
		// the exception-filter path, so recipients saw the HTML as literal text.
		res.statusCode = 429;
		res.setHeader('Content-Type', contentType);
		res.setHeader('Retry-After', '60');
		res.setHeader('Cache-Control', 'no-store');
		res.end(body);
	}
}
