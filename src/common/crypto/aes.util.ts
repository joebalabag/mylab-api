import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for at-rest secrets (currently: per-tenant SMTP
 * passwords). Ciphertext is base64-encoded and self-contained — the IV and
 * auth tag ride along inside the string, so decryption only needs the
 * key.
 *
 * Wire format: base64(iv[12] || tag[16] || ciphertext)
 *
 * Key: derived from SMTP_ENCRYPTION_KEY when set, else falls back to
 * JWT_SECRET so a fresh dev install works without new env plumbing.
 * SHA-256'd to guarantee a 32-byte key regardless of the input length.
 */

function key(): Buffer {
	const raw = process.env.SMTP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'super-secret-change-me';
	return createHash('sha256').update(raw).digest(); // 32 bytes
}

export function encryptSecret(plaintext: string): string {
	if (plaintext == null) return '';
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string | null | undefined): string {
	if (!payload) return '';
	try {
		const buf = Buffer.from(payload, 'base64');
		if (buf.length < 12 + 16 + 1) return ''; // too short to be a real payload
		const iv  = buf.subarray(0, 12);
		const tag = buf.subarray(12, 28);
		const enc = buf.subarray(28);
		const decipher = createDecipheriv('aes-256-gcm', key(), iv);
		decipher.setAuthTag(tag);
		const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
		return dec.toString('utf8');
	} catch {
		// Wrong key / tampered payload — treat as absent so the caller can
		// fall back to the default SMTP instead of throwing on a request that
		// isn't the encryption's fault.
		return '';
	}
}
