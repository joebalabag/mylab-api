import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

/**
 * Static health probe used by the frontend's offline-detection heartbeat.
 * No auth, no DB, no throttling — the intent is to be the cheapest possible
 * request the browser can make so we can spam it every 30s per tab without
 * measurable load. Response body is intentionally tiny; the frontend only
 * cares about the status code.
 *
 * Sets Cache-Control: no-store so intermediate caches (nginx micro-cache,
 * PWA service worker, browser disk cache) can't hand back a stale "ok" once
 * the server is actually down — which would defeat the whole point.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
	@Get()
	@ApiOperation({ summary: 'Health probe. Returns 200 { ok: true } when the API is reachable. Used by the frontend heartbeat to detect offline state.' })
	ping(@Res() res: Response) {
		res.setHeader('Cache-Control', 'no-store, max-age=0');
		res.setHeader('Pragma', 'no-cache');
		return res.status(200).json({ ok: true });
	}
}
