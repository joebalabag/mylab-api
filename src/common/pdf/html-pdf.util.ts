import { Logger } from '@nestjs/common';
import type { Browser, LaunchOptions } from 'puppeteer';

const logger = new Logger('HtmlPdf');

// Puppeteer went ESM-only in v23, so a plain `import puppeteer from 'puppeteer'`
// gets transpiled to `require('puppeteer')` under our CJS tsconfig and blows
// up at runtime with ERR_REQUIRE_ESM. Route the import through Function() so
// TypeScript can't rewrite it back into a require — this stays a true dynamic
// ES import in the compiled JS.
let puppeteerPromise: Promise<{ launch: (opts?: LaunchOptions) => Promise<Browser> }> | undefined;
function loadPuppeteer() {
	if (!puppeteerPromise) {
		puppeteerPromise = (Function('return import("puppeteer")') as () => Promise<any>)()
			.then((mod) => mod.default ?? mod);
	}
	return puppeteerPromise;
}

export interface RenderHtmlToPdfOptions {
	/**
	 * When set, injected as `<base href="...">` so `<link rel=stylesheet>` and
	 * relative `<img>` URLs in the passed HTML resolve against the frontend
	 * origin. Required whenever the HTML references assets by root-relative
	 * paths (e.g. Vite-emitted `/assets/index-XXX.css`).
	 */
	baseHref?: string;
	/**
	 * Debug label surfaced in logs when render fails / takes long. Report lab
	 * number is a natural fit.
	 */
	label?: string;
}

/**
 * Render an HTML document to a PDF Buffer using headless Chromium. Sizing
 * comes from the HTML's own `@page { size: X; margin: 0; }` rule
 * (preferCSSPageSize=true) — so caller controls paper via its own CSS. Backgrounds
 * are always painted so the report's tinted headers / table stripes show up.
 *
 * A fresh browser is launched per call and torn down in the finally block; the
 * per-request overhead (~500ms) is acceptable given emailing a finalized report
 * is not a hot path.
 */
export async function renderHtmlToPdf(html: string, opts: RenderHtmlToPdfOptions = {}): Promise<Buffer> {
	const label = opts.label ? ` [${opts.label}]` : '';
	const started = Date.now();

	// `--no-sandbox` is the standard flag for headless Chromium on Linux VMs /
	// containers where the user-namespace sandbox isn't set up. It's a common
	// requirement for CI and PaaS hosts and doesn't materially reduce safety
	// since we're only rendering our own HTML on the same host.
	const puppeteer = await loadPuppeteer();
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
	});
	try {
		const page = await browser.newPage();
		// The print HTML is static markup — disabling JS eliminates any chance
		// of accidental script execution during render and speeds things up.
		await page.setJavaScriptEnabled(false);

		const withBase = opts.baseHref
			? injectBaseHref(html, opts.baseHref)
			: html;

		// setContent's waitUntil only accepts 'load' / 'domcontentloaded' in
		// this Puppeteer version — use it for the initial parse, then wait
		// separately for network idle + fonts so every stylesheet, image, and
		// @font-face has actually settled before we snapshot the PDF.
		await page.setContent(withBase, { waitUntil: 'load', timeout: 30_000 });
		await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 }).catch(() => { /* best-effort */ });
		await page.evaluateHandle('document.fonts.ready');

		const pdfUint8 = await page.pdf({
			printBackground: true,
			preferCSSPageSize: true,      // honor the HTML's own @page size rule
			margin: { top: 0, right: 0, bottom: 0, left: 0 },
		});
		logger.log(`Rendered PDF${label} in ${Date.now() - started}ms (${pdfUint8.length} bytes)`);
		return Buffer.from(pdfUint8);
	} catch (err: any) {
		logger.error(`Puppeteer render failed${label}: ${err?.message}`, err?.stack);
		throw err;
	} finally {
		await browser.close().catch(() => { /* already closed */ });
	}
}

/**
 * Splice a `<base href="...">` element into the document head. Robust to
 * mixed-case `<HEAD>` and `<head class="...">` variants but bails out
 * gracefully when there's no head tag at all (prepends a minimal head).
 */
function injectBaseHref(html: string, baseHref: string): string {
	const safe = escapeHtmlAttr(baseHref);
	const tag = `<base href="${safe}">`;
	const headOpen = /<head\b[^>]*>/i;
	if (headOpen.test(html)) return html.replace(headOpen, (m) => `${m}${tag}`);
	// No <head> at all — inject one right after the html tag (or at the top).
	const htmlOpen = /<html\b[^>]*>/i;
	if (htmlOpen.test(html)) return html.replace(htmlOpen, (m) => `${m}<head>${tag}</head>`);
	return `<head>${tag}</head>${html}`;
}

function escapeHtmlAttr(v: string): string {
	return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
