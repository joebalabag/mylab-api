import { Injectable } from '@nestjs/common';
import { Tenant } from '../tenant/tenant.model';

export interface ReadinessStep {
	key: string;
	label: string;
	description: string;
	route: string;             // Frontend route to the setup screen (deep link)
	category: 'setup' | 'catalog';
	required: boolean;         // false = nice-to-have, not counted against readiness
	done: boolean;
	count?: number;            // optional data-count (e.g. 3 doctors)
	detail?: string;           // human-readable status ("Company name missing")
}

/**
 * Setup Readiness. Checks whether the tenant has the one-time configuration
 * needed to START operating — company info, users, doctors, and the test
 * catalog. Doesn't track operational activity (patients / payments / lab
 * reports) — that's what the Dashboard is for. Readiness = "can we open
 * for business today?", not "have we transacted yet?".
 *
 * Two phases:
 *   setup   — company profile, users, signatory doctors
 *   catalog — item groups, categories, test items (± optional bundles)
 */
@Injectable()
export class SetupReadinessService {
	async getStatus(tenant_uuid: string): Promise<{
		steps: ReadinessStep[];
		completed: number;
		total: number;
		required_total: number;
		required_completed: number;
		progress_pct: number;
		ready: boolean;
	}> {
		const knex = Tenant.knex();

		// Snapshot the tenant record so we can inspect setup-completeness of
		// the company profile in one round-trip.
		const tenant: any = await knex('tenants').where({ uuid: tenant_uuid }).first();

		// Count helper — SELECT COUNT(*) FROM table WHERE tenant_uuid = ...
		const countOf = async (table: string, extra?: (qb: any) => void): Promise<number> => {
			const q = knex(table).where({ tenant_uuid });
			if (extra) q.modify(extra);
			const row: any = await q.count({ n: '*' }).first();
			return Number(row?.n ?? 0);
		};

		// ─── Company Settings — tenant record has enough to print a receipt ─
		const companyMissing: string[] = [];
		if (!tenant?.display_name)     companyMissing.push('display name');
		if (!tenant?.address_street1)  companyMissing.push('address');
		if (!tenant?.contact_number)   companyMissing.push('contact number');
		if (!tenant?.email_address)    companyMissing.push('email');

		// ─── Users, doctors, catalog counts (batched in parallel) ─
		const [
			userCount, doctorCount,
			groupCount, categoryCount, testItemCount,
			discountCount, packageCount,
		] = await Promise.all([
			countOf('users'),
			countOf('doctors'),
			countOf('item_groups'),
			countOf('item_categories'),
			countOf('test_items'),
			countOf('discounts'),
			countOf('item_packages'),
		]);

		const steps: ReadinessStep[] = [
			// ─── Setup ─────────────────────────────────────────────────────
			{
				key: 'company', label: 'Company Settings',
				description: 'Company name, address, and contact — printed on every receipt and report.',
				route: '/settings/tenant', category: 'setup', required: true,
				done: companyMissing.length === 0,
				detail: companyMissing.length ? `Missing: ${companyMissing.join(', ')}` : 'Complete',
			},
			{
				key: 'lab_header', label: 'Lab Report Header',
				description: 'Header text or banner image printed at the top of every lab report.',
				route: '/settings/tenant', category: 'setup', required: false,
				done: !!(tenant?.lab_header_text || tenant?.lab_header_image),
				detail: (tenant?.lab_header_text || tenant?.lab_header_image) ? 'Configured' : 'Not set',
			},
			{
				key: 'receipt_header', label: 'Cashier Receipt Header',
				description: 'Custom text that appears at the top of the cashier receipt.',
				route: '/settings/tenant', category: 'setup', required: false,
				done: !!tenant?.receipt_header,
				detail: tenant?.receipt_header ? 'Configured' : 'Optional',
			},
			{
				key: 'users', label: 'Users',
				description: 'At least one operator account so the tenant isn\'t single-seat.',
				route: '/users', category: 'setup', required: true,
				done: userCount >= 1,
				count: userCount,
				detail: `${userCount} user(s)`,
			},
			{
				key: 'doctors', label: 'Signatory Doctors',
				description: 'A pathologist / medtech is needed to sign off on finalized lab reports.',
				route: '/settings/tenant', category: 'setup', required: true,
				done: doctorCount >= 1,
				count: doctorCount,
				detail: `${doctorCount} doctor(s)`,
			},

			// ─── Catalog ───────────────────────────────────────────────────
			{
				key: 'item_groups', label: 'Item Groups',
				description: 'The top-level buckets your tests are organized under. Use "Import from Pre-loaded" for a quick start.',
				route: '/item-groups', category: 'catalog', required: true,
				done: groupCount >= 1,
				count: groupCount,
				detail: `${groupCount} group(s)`,
			},
			{
				key: 'item_categories', label: 'Item Categories',
				description: 'Sub-buckets under each group (Chemistry, Hematology, …). Auto-created if you imported the pre-loaded catalog.',
				route: '/item-categories', category: 'catalog', required: true,
				done: categoryCount >= 1,
				count: categoryCount,
				detail: `${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}`,
			},
			{
				key: 'test_items', label: 'Test Items',
				description: 'Individual tests (or panels) you offer — the billable menu.',
				route: '/test-items', category: 'catalog', required: true,
				done: testItemCount >= 1,
				count: testItemCount,
				detail: `${testItemCount} test(s)`,
			},
			{
				key: 'discounts', label: 'Discounts',
				description: 'Optional discount codes (senior, PWD, promo) the cashier can apply.',
				route: '/discounts', category: 'catalog', required: false,
				done: discountCount >= 1,
				count: discountCount,
				detail: discountCount ? `${discountCount} discount(s)` : 'Optional',
			},
			{
				key: 'packages', label: 'Item Packages',
				description: 'Optional bundles of tests billed as one line (e.g. Executive Panel).',
				route: '/item-packages', category: 'catalog', required: false,
				done: packageCount >= 1,
				count: packageCount,
				detail: packageCount ? `${packageCount} package(s)` : 'Optional',
			},
		];

		const total = steps.length;
		const completed = steps.filter((s) => s.done).length;
		const requiredSteps = steps.filter((s) => s.required);
		const required_total = requiredSteps.length;
		const required_completed = requiredSteps.filter((s) => s.done).length;
		const progress_pct = required_total === 0 ? 100 : Math.round((required_completed / required_total) * 100);
		const ready = required_completed === required_total;

		return { steps, completed, total, required_total, required_completed, progress_pct, ready };
	}
}
