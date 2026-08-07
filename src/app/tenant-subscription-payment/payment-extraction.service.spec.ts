/// <reference types="jest" />
import { PaymentExtractionService } from './payment-extraction.service';

/**
 * Direct spec for the regex extractors. Bypasses OCR by calling the private
 * matchers via a subclass. Keeps the field-detection logic tested without
 * needing a real payment-slip image fixture.
 */
class TestableExtractor extends PaymentExtractionService {
	pickReference(text: string) {
		return (this as any).matchReference(text);
	}
	pickAccount(text: string) {
		return (this as any).matchAccount(text);
	}
	pickMethod(text: string) {
		return (this as any).matchMethod(text);
	}
	pickDatetime(text: string) {
		return (this as any).matchDatetime(text);
	}
	pickAmount(text: string) {
		return (this as any).matchAmount(text);
	}
}

describe('PaymentExtractionService — regex extractors', () => {
	const svc = new TestableExtractor();

	describe('reference number', () => {
		it('picks Ref. No.', () => {
			expect(svc.pickReference('Ref. No.: ABC-123456789')).toBe('ABC-123456789');
		});
		it('picks Transaction ID', () => {
			expect(svc.pickReference('Transaction ID: 987654321')).toBe('987654321');
		});
		it('picks Confirmation #', () => {
			expect(svc.pickReference('Confirmation #: XY-000123')).toBe('XY-000123');
		});
		it('returns null when absent', () => {
			expect(svc.pickReference('Thank you for your payment')).toBeNull();
		});
	});

	describe('payee account', () => {
		it('picks account no with dashes', () => {
			expect(svc.pickAccount('Account No.: 1234-5678-9012')).toContain('1234');
		});
		it('picks masked account', () => {
			expect(svc.pickAccount('•••• 4321 - available')).toMatch(/4321/);
		});
		it('picks Payee: prefix', () => {
			expect(svc.pickAccount('Payee: 09171234567 (Juan)')).toContain('0917');
		});
	});

	describe('payment method', () => {
		it('detects GCash → ewallet', () => {
			expect(svc.pickMethod('Sent via GCash')).toEqual({ name: 'GCash', type: 'ewallet' });
		});
		it('detects BDO → bank_transfer', () => {
			expect(svc.pickMethod('BDO Online Banking')).toEqual({ name: 'BDO', type: 'bank_transfer' });
		});
		it('detects Maya', () => {
			expect(svc.pickMethod('Maya Mobile Wallet')).toEqual({ name: 'Maya', type: 'ewallet' });
		});
		it('null when no known channel', () => {
			expect(svc.pickMethod('Some random text')).toBeNull();
		});
	});

	describe('amount paid', () => {
		it('Amount Paid: PHP 500.00', () => {
			expect(svc.pickAmount('Amount Paid: PHP 500.00')).toBe(500);
		});
		it('Amount: ₱ 1,234.50', () => {
			expect(svc.pickAmount('Amount: ₱ 1,234.50')).toBe(1234.5);
		});
		it('Total: 250', () => {
			expect(svc.pickAmount('Total: 250')).toBe(250);
		});
		it('Sent PHP 199.99', () => {
			expect(svc.pickAmount('Sent PHP 199.99')).toBe(199.99);
		});
		it('bare currency prefix: ₱ 749', () => {
			expect(svc.pickAmount('You will pay ₱ 749')).toBe(749);
		});
		it('suffix: 500.00 PHP', () => {
			expect(svc.pickAmount('500.00 PHP')).toBe(500);
		});
		it('handles commas: 12,345.00', () => {
			expect(svc.pickAmount('Amount 12,345.00')).toBe(12345);
		});
		it('null when no amount present', () => {
			expect(svc.pickAmount('Reference No. ABC-123')).toBeNull();
		});
	});

	describe('datetime', () => {
		it('ISO', () => {
			expect(svc.pickDatetime('2026-07-03 10:15:00')).toBe('2026-07-03T10:15:00');
		});
		it('Jul 03, 2026, 10:15 AM', () => {
			expect(svc.pickDatetime('Jul 03, 2026, 10:15 AM')).toBe('2026-07-03T10:15:00');
		});
		it('03 Jul 2026 10:15 PM (12h → 24h)', () => {
			expect(svc.pickDatetime('03 Jul 2026 10:15 PM')).toBe('2026-07-03T22:15:00');
		});
		it('12 AM → 00', () => {
			expect(svc.pickDatetime('Jul 03, 2026, 12:00 AM')).toBe('2026-07-03T00:00:00');
		});
		it('null when unparseable', () => {
			expect(svc.pickDatetime('some prose')).toBeNull();
		});
	});
});
