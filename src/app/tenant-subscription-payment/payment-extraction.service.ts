import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, statSync } from 'fs';

export interface PaymentExtraction {
	payment_reference_number?: string | null;
	payee_account_number?: string | null;
	payment_method?: string | null;
	payment_method_name?: string | null;
	payment_datetime?: string | null;
	amount_paid?: number | null;
	confidence?: number | null;
	raw?: any;
}

/**
 * Free, in-process extraction of payment-slip fields.
 *
 * Uses **Tesseract.js** for OCR (Apache-2 licensed, no API key, no cost, no
 * rate limit) and then regexes the resulting text for the fields the tenant
 * payment API needs.
 *
 * Env toggle (defaults to enabled):
 *   AI_VISION_PROVIDER=tesseract   → enabled (default)
 *   AI_VISION_PROVIDER=none        → skip extraction (returns null)
 *
 * Small images (<1 KB — placeholders / test fixtures) are skipped so specs
 * stay fast. Real-sized slips flow through OCR.
 */
@Injectable()
export class PaymentExtractionService {
	private readonly logger = new Logger(PaymentExtractionService.name);
	private static readonly MIN_BYTES = 1024;

	/** Match short-circuits for common Philippine payment channels. */
	private static readonly METHOD_NAME_PATTERNS: Array<[RegExp, string, string]> = [
		[/\bgcash\b/i, 'GCash', 'ewallet'],
		[/\b(pay ?maya|maya)\b/i, 'Maya', 'ewallet'],
		[/\bcoins\.?ph\b/i, 'Coins.ph', 'ewallet'],
		[/\bgrabpay\b/i, 'GrabPay', 'ewallet'],
		[/\bbpi\b/i, 'BPI', 'bank_transfer'],
		[/\bbdo\b/i, 'BDO', 'bank_transfer'],
		[/\bmetrobank\b/i, 'Metrobank', 'bank_transfer'],
		[/\bunion ?bank\b/i, 'UnionBank', 'bank_transfer'],
		[/\bland ?bank\b/i, 'Landbank', 'bank_transfer'],
		[/\bpnb\b/i, 'PNB', 'bank_transfer'],
		[/\bsecurity ?bank\b/i, 'Security Bank', 'bank_transfer'],
		[/\brcbc\b/i, 'RCBC', 'bank_transfer'],
		[/\bchinabank\b/i, 'Chinabank', 'bank_transfer'],
		[/\beastwest\b/i, 'EastWest', 'bank_transfer'],
		[/\bpalawan\b/i, 'Palawan Express', 'remittance'],
		[/\bcebuana\b/i, 'Cebuana Lhuillier', 'remittance'],
	];

	async extractFromFile(absolutePath: string, mimeType: string): Promise<PaymentExtraction | null> {
		const provider = (process.env.AI_VISION_PROVIDER || 'tesseract').toLowerCase();
		if (provider === 'none' || provider === 'off') return null;

		try {
			const size = statSync(absolutePath).size;
			if (size < PaymentExtractionService.MIN_BYTES) {
				this.logger.debug(`skipping OCR — attachment ${size} bytes < ${PaymentExtractionService.MIN_BYTES}`);
				return null;
			}

			if (provider === 'tesseract') return await this.extractViaTesseract(absolutePath, mimeType);

			this.logger.warn(`unknown AI_VISION_PROVIDER=${provider}; skipping extraction.`);
			return null;
		} catch (e: any) {
			this.logger.error(`extraction failed: ${e?.message}`);
			return null;
		}
	}

	// ── Tesseract ────────────────────────────────────────────────────

	private async extractViaTesseract(absolutePath: string, _mimeType: string): Promise<PaymentExtraction | null> {
		// Dynamic import keeps the WASM out of the cold path when the
		// service isn't used (or extraction is disabled).
		const Tesseract: any = await import('tesseract.js');
		const buffer = readFileSync(absolutePath);

		const { data } = await Tesseract.recognize(buffer, 'eng', {
			logger: () => undefined,
		});

		const text: string = (data?.text || '').trim();
		if (!text) return null;

		const method = this.matchMethod(text);

		return {
			payment_reference_number: this.matchReference(text),
			payee_account_number: this.matchAccount(text),
			payment_method: method?.type ?? null,
			payment_method_name: method?.name ?? null,
			payment_datetime: this.matchDatetime(text),
			amount_paid: this.matchAmount(text),
			confidence: typeof data?.confidence === 'number' ? Number((data.confidence / 100).toFixed(2)) : null,
			raw: { text, confidence: data?.confidence ?? null },
		};
	}

	// ── Regex extractors ─────────────────────────────────────────────

	private matchReference(text: string): string | null {
		const candidates = [
			/ref(?:erence)?\.?\s*(?:no\.?|#|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{5,})/i,
			/trans(?:action)?\.?\s*(?:no\.?|id|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{5,})/i,
			/confirmation\.?\s*(?:no\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{5,})/i,
		];
		for (const r of candidates) {
			const m = text.match(r);
			if (m?.[1]) return m[1].trim();
		}
		return null;
	}

	private matchAccount(text: string): string | null {
		const candidates = [
			/(?:to|payee|acc(?:ount)?)\s*(?:no\.?|#|number)?\s*[:\-]?\s*([0-9x*•][0-9x*•\- ]{3,})/i,
			// Masked patterns: ****1234, ••••1234, xxxx1234
			/([x*•]{4,}\s*\d{2,4})/i,
		];
		for (const r of candidates) {
			const m = text.match(r);
			if (m?.[1]) return m[1].trim().replace(/\s{2,}/g, ' ');
		}
		return null;
	}

	private matchMethod(text: string): { name: string; type: string } | null {
		for (const [rx, name, type] of PaymentExtractionService.METHOD_NAME_PATTERNS) {
			if (rx.test(text)) return { name, type };
		}
		return null;
	}

	private matchDatetime(text: string): string | null {
		// ISO-ish 2026-07-03 10:15 / 2026-07-03T10:15:00
		const iso = text.match(/(\d{4}-\d{2}-\d{2})[ tT](\d{1,2}:\d{2}(?::\d{2})?)/);
		if (iso) return `${iso[1]}T${iso[2]}`;

		const monthMap: Record<string, string> = {
			jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
			jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
		};

		// "03 Jul 2026 10:15 AM"
		const en = text.match(
			/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})[, ]+\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i
		);
		if (en) return this.formatDate(en[3], monthMap[en[2].toLowerCase()], en[1], en[4], en[5], en[6]);

		// "Jul 03, 2026, 10:15 AM"
		const en2 = text.match(
			/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})[, ]+\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i
		);
		if (en2) return this.formatDate(en2[3], monthMap[en2[1].toLowerCase()], en2[2], en2[4], en2[5], en2[6]);

		return null;
	}

	/**
	 * Pick the paid amount. Handles: "Amount Paid: PHP 500.00", "Total: ₱ 500",
	 * bare "PHP 1,234.50", "P 500", "500.00 PHP", etc. Returns a plain number.
	 */
	private matchAmount(text: string): number | null {
		const num = /([\d]{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/;
		const numStr = num.source;

		const labelled = [
			new RegExp(`amount\\s*(?:paid|sent)?\\s*[:\\-]?\\s*(?:php|₱|p)?\\s*${numStr}`, 'i'),
			new RegExp(`total\\s*(?:amount|paid|due)?\\s*[:\\-]?\\s*(?:php|₱|p)?\\s*${numStr}`, 'i'),
			new RegExp(`paid\\s*[:\\-]?\\s*(?:php|₱|p)?\\s*${numStr}`, 'i'),
			new RegExp(`sent\\s*[:\\-]?\\s*(?:php|₱|p)?\\s*${numStr}`, 'i'),
			// Currency prefix without label — e.g. "₱ 1,234.50"
			new RegExp(`(?:php|₱)\\s*${numStr}`, 'i'),
			// Suffix — "500.00 PHP"
			new RegExp(`${numStr}\\s*(?:php|₱)`, 'i'),
		];
		for (const r of labelled) {
			const m = text.match(r);
			if (m?.[1]) {
				const clean = m[1].replace(/,/g, '');
				const n = Number(clean);
				if (Number.isFinite(n) && n >= 0) return n;
			}
		}
		return null;
	}

	private formatDate(year: string, mon: string, day: string, hStr: string, mm: string, ampm?: string): string {
		let hh = parseInt(hStr, 10);
		const p = ampm?.toLowerCase();
		if (p === 'pm' && hh < 12) hh += 12;
		if (p === 'am' && hh === 12) hh = 0;
		return `${year}-${mon}-${day.padStart(2, '0')}T${String(hh).padStart(2, '0')}:${mm}:00`;
	}
}
