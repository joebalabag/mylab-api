import { BadRequestException, Logger } from '@nestjs/common';

// Thin wrapper around the PayPal REST API. Kept as plain functions (no Nest
// DI) so the service can call it inside Objection transactions without extra
// wiring. All calls use the global fetch shipped with Node 18+.
//
// Environment (read at call-time so a .env reload after a hot-restart picks up):
//   PAYPAL_ENV           = "sandbox" (default) | "live"
//   PAYPAL_CLIENT_ID     — REST app client id
//   PAYPAL_CLIENT_SECRET — REST app secret
//   PAYPAL_WEBHOOK_ID    — id of the registered webhook (needed to verify signatures)

const log = new Logger('PayPalUtil');

export interface PaypalConfig {
	env: 'sandbox' | 'live';
	clientId: string;
	clientSecret: string;
	webhookId: string;
	baseUrl: string;
}

export function readPaypalConfig(): PaypalConfig {
	const env = (String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live'
		? 'live'
		: 'sandbox') as 'sandbox' | 'live';
	const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
	const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
	const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
	const baseUrl = env === 'live'
		? 'https://api-m.paypal.com'
		: 'https://api-m.sandbox.paypal.com';
	return { env, clientId, clientSecret, webhookId, baseUrl };
}

export function assertPaypalConfigured(cfg: PaypalConfig): void {
	if (!cfg.clientId || !cfg.clientSecret) {
		throw new BadRequestException(
			'PayPal is not configured on this server. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.',
		);
	}
}

// The access token lives for ~9 hours. Cache it in-process; a restart is fine.
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(cfg: PaypalConfig): Promise<string> {
	const now = Date.now();
	if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

	const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
	const res = await fetch(`${cfg.baseUrl}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${basic}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
	});
	const json: any = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new BadRequestException(`PayPal auth failed (${res.status}): ${json?.error_description || res.statusText}`);
	}
	const token: string = json.access_token;
	const ttl: number = Number(json.expires_in || 32000) * 1000;
	cachedToken = { token, expiresAt: now + ttl };
	return token;
}

export interface CreateOrderParams {
	amount: number;
	currency: string;
	referenceId: string;   // our tenant_uuid or a shorter key
	description?: string;
	returnUrl?: string;
	cancelUrl?: string;
	customId?: string;     // opaque tenant/plan pair we get back in webhooks
}

export interface CreatedOrder {
	id: string;
	status: string;
	links: Array<{ rel: string; href: string; method: string }>;
}

export async function createOrder(cfg: PaypalConfig, p: CreateOrderParams): Promise<CreatedOrder> {
	const token = await getAccessToken(cfg);
	const body = {
		intent: 'CAPTURE',
		purchase_units: [
			{
				reference_id: p.referenceId,
				description: p.description || 'MyLab subscription',
				custom_id: p.customId,
				amount: {
					currency_code: p.currency,
					value: p.amount.toFixed(2),
				},
			},
		],
		application_context: {
			shipping_preference: 'NO_SHIPPING',
			user_action: 'PAY_NOW',
			return_url: p.returnUrl,
			cancel_url: p.cancelUrl,
		},
	};
	const res = await fetch(`${cfg.baseUrl}/v2/checkout/orders`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	const json: any = await res.json().catch(() => ({}));
	if (!res.ok) {
		log.error(`createOrder failed: ${res.status} ${JSON.stringify(json)}`);
		throw new BadRequestException(`PayPal createOrder failed: ${json?.message || res.statusText}`);
	}
	return json as CreatedOrder;
}

export interface CapturedOrder {
	id: string;
	status: string;                          // COMPLETED when done
	purchase_units: Array<{
		reference_id?: string;
		custom_id?: string;
		payments?: {
			captures?: Array<{
				id: string;                    // capture id (idempotency key for webhook + this call)
				status: string;
				custom_id?: string;            // PayPal sometimes echoes custom_id here instead of on the purchase_unit
				amount: { currency_code: string; value: string };
			}>;
		};
	}>;
	payer?: { email_address?: string; payer_id?: string };
}

export async function captureOrder(cfg: PaypalConfig, orderId: string): Promise<CapturedOrder> {
	const token = await getAccessToken(cfg);
	const res = await fetch(`${cfg.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			// PayPal-Request-Id is optional but makes retries safe from our side.
			'PayPal-Request-Id': orderId,
		},
	});
	const json: any = await res.json().catch(() => ({}));
	// PayPal returns 422 with issue=ORDER_ALREADY_CAPTURED when this order was
	// already captured (e.g., the webhook beat us to it). Treat that as "look
	// it up" rather than an error; the caller de-dupes on capture id.
	if (res.status === 422 && Array.isArray(json?.details)) {
		const already = json.details.some((d: any) => d.issue === 'ORDER_ALREADY_CAPTURED');
		if (already) {
			return getOrder(cfg, orderId) as unknown as CapturedOrder;
		}
	}
	if (!res.ok) {
		log.error(`captureOrder failed: ${res.status} ${JSON.stringify(json)}`);
		throw new BadRequestException(`PayPal captureOrder failed: ${json?.message || res.statusText}`);
	}
	return json as CapturedOrder;
}

export async function getOrder(cfg: PaypalConfig, orderId: string): Promise<CapturedOrder> {
	const token = await getAccessToken(cfg);
	const res = await fetch(`${cfg.baseUrl}/v2/checkout/orders/${orderId}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const json: any = await res.json().catch(() => ({}));
	if (!res.ok) throw new BadRequestException(`PayPal getOrder failed: ${json?.message || res.statusText}`);
	return json as CapturedOrder;
}

export interface WebhookHeaders {
	transmissionId: string;
	transmissionTime: string;
	certUrl: string;
	authAlgo: string;
	transmissionSig: string;
}

// The webhook route reads the case-insensitive PayPal headers off the raw
// request; this helper normalizes them to the shape expected by the verify
// endpoint. Missing values become empty strings so verify() returns FAILURE
// rather than crashing.
export function readWebhookHeaders(headers: Record<string, any>): WebhookHeaders {
	const h = (name: string) => {
		const v = headers[name] ?? headers[name.toLowerCase()] ?? '';
		return Array.isArray(v) ? String(v[0] || '') : String(v || '');
	};
	return {
		transmissionId:   h('paypal-transmission-id'),
		transmissionTime: h('paypal-transmission-time'),
		certUrl:          h('paypal-cert-url'),
		authAlgo:         h('paypal-auth-algo'),
		transmissionSig:  h('paypal-transmission-sig'),
	};
}

// Verifies a webhook signature server-to-server. `rawBodyJson` must be the
// parsed event object PayPal sent — verify accepts it as `webhook_event`
// (not the raw string). Returns true only on SUCCESS.
export async function verifyWebhookSignature(
	cfg: PaypalConfig,
	headers: WebhookHeaders,
	webhookEvent: unknown,
): Promise<boolean> {
	if (!cfg.webhookId) {
		log.warn('PAYPAL_WEBHOOK_ID not set — refusing to verify webhook. Set it in .env and re-register the webhook.');
		return false;
	}
	const token = await getAccessToken(cfg);
	const body = {
		auth_algo:         headers.authAlgo,
		cert_url:          headers.certUrl,
		transmission_id:   headers.transmissionId,
		transmission_sig:  headers.transmissionSig,
		transmission_time: headers.transmissionTime,
		webhook_id:        cfg.webhookId,
		webhook_event:     webhookEvent,
	};
	const res = await fetch(`${cfg.baseUrl}/v1/notifications/verify-webhook-signature`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	const json: any = await res.json().catch(() => ({}));
	if (!res.ok) {
		log.error(`verifyWebhookSignature HTTP ${res.status}: ${JSON.stringify(json)}`);
		return false;
	}
	return json?.verification_status === 'SUCCESS';
}
