import { Logger } from '@nestjs/common';

const logger = new Logger('PdfEncrypt');

// @muhammara/native ships prebuilt bindings; require lazily so the module is
// only resolved when a report actually needs to be encrypted. This keeps unit
// tests that don't touch the mailer free of the native-binding load cost.
// (The unscoped `muhammara` package was deprecated at v7 — breaking changes:
// https://muhammarajs.readthedocs.io/page/breaking-changes.html#version-7x)
let muhammaraPromise: Promise<any> | undefined;
function loadMuhammara() {
	if (!muhammaraPromise) {
		muhammaraPromise = Promise.resolve().then(() => require('@muhammara/native'));
	}
	return muhammaraPromise;
}

/**
 * Return a copy of `input` encrypted with `password` as both the user and
 * owner password. User-protection flag 0xFFFFFFFC (~3) keeps print + copy +
 * form-fill enabled — we only want the file to be unreadable without the
 * birthdate, not DRM-locked. If encryption fails for any reason (missing
 * native bindings, malformed PDF), the original buffer is returned so the
 * email still goes out; callers should check the returned `encrypted` flag.
 */
export async function encryptPdfBuffer(
	input: Buffer,
	password: string,
): Promise<{ buffer: Buffer; encrypted: boolean }> {
	if (!password) return { buffer: input, encrypted: false };
	try {
		const muhammara = await loadMuhammara();
		const reader = new muhammara.PDFRStreamForBuffer(input);
		const writer = new muhammara.PDFWStreamForBuffer();
		muhammara.recrypt(reader, writer, {
			userPassword: password,
			ownerPassword: password,
			userProtectionFlag: 4,
		});
		// v7 docs: PDFWStreamForBuffer#buffer may be null — treat that as a
		// failed encryption and fall back to the original bytes.
		if (!writer.buffer) {
			logger.warn('PDF encryption produced an empty writer buffer, sending unprotected.');
			return { buffer: input, encrypted: false };
		}
		return { buffer: Buffer.from(writer.buffer), encrypted: true };
	} catch (err: any) {
		logger.warn(`PDF encryption failed, sending unprotected: ${err?.message || err}`);
		return { buffer: input, encrypted: false };
	}
}
