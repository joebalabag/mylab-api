import { Injectable } from '@nestjs/common';
import { Payment, ARRANGEMENT_PAYMENT_METHODS, SELF_RESOLVING_ARRANGEMENTS } from '../payment/payment.model';
import { PaymentItem } from '../payment/payment-item.model';
import { PatientCase } from '../patient-case/patient-case.model';
import { LabReport } from '../lab-report/lab-report.model';
import { Expense } from '../expense/expense.model';

/**
 * Report aggregations. Every method takes tenant_uuid + a date range (or
 * a year for monthly reports) and returns rows shaped for direct table /
 * chart rendering.
 *
 * Voided payments are excluded from revenue everywhere except the Void
 * Report itself, which is *about* voided rows.
 */
@Injectable()
export class ReportsService {
	private eod(d?: string): string | undefined { return d ? `${d} 23:59:59` : undefined; }

	// ─────────────────────────────── SUMMARY ───────────────────────────────
	// One-page overview with KPIs + transaction analytics: totals, method
	// mix, daily trend, top cashiers, avg / min / max ticket. Designed so the
	// entire summary fits on a single printed sheet — one round-trip fills
	// the whole view.
	async summary(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const to = this.eod(date_to);

		// Range filter reused across every payment subquery — DRY the common
		// where-clause into one function so date_from/date_to stay in lockstep.
		const applyRange = (qb: any) => {
			if (date_from) qb.where('payment_date', '>=', date_from);
			if (to) qb.where('payment_date', '<=', to);
		};

		const paymentsRow: any = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.modify(applyRange)
			.select(knex.raw(`
				COALESCE(SUM(total),0) as revenue,
				COALESCE(SUM(discount_amount),0) as discounts,
				COUNT(*) as n,
				COALESCE(AVG(total),0) as avg_ticket,
				COALESCE(MAX(total),0) as max_ticket,
				COALESCE(MIN(total),0) as min_ticket
			`))
			.first();

		const voidedRow: any = await knex('payments')
			.where({ tenant_uuid, status: 'voided' })
			.modify(applyRange)
			.select(knex.raw(`COALESCE(SUM(total),0) as voided_amount, COUNT(*) as n`))
			.first();

		const outstandingRow: any = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.whereNotIn('payment_method', SELF_RESOLVING_ARRANGEMENTS as unknown as string[])
			.whereNull('arrangement_resolved_at')
			.select(knex.raw(`COALESCE(SUM(total),0) as outstanding, COUNT(*) as n`))
			.first();

		const expensesRow: any = await Expense.knex()('expenses')
			.where({ tenant_uuid, status: 'active' })
			.modify(qb => { if (date_from) qb.where('date_transact', '>=', date_from); if (date_to) qb.where('date_transact', '<=', date_to); })
			.select(knex.raw(`COALESCE(SUM(amount),0) as expenses, COUNT(*) as n`))
			.first();

		// Method mix (completed, incl. arrangements so ops can see the
		// full picture of "how are people paying / what are we billing").
		const byMethod = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.modify(applyRange)
			.select('payment_method')
			.sum({ total: 'total' })
			.count({ count: '*' })
			.groupBy('payment_method')
			.orderByRaw(`SUM(total) DESC`);

		// Daily revenue trend for the sparkline / line chart.
		const dailyTrend = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.modify(applyRange)
			.select(knex.raw(`to_char(payment_date::date, 'YYYY-MM-DD') as date`))
			.sum({ revenue: 'total' })
			.count({ count: '*' })
			.groupByRaw(`payment_date::date`)
			.orderByRaw(`payment_date::date`);

		// Top 5 cashiers by revenue collected.
		const topCashiers = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.modify(applyRange)
			.select('created_by')
			.sum({ revenue: 'total' })
			.count({ count: '*' })
			.groupBy('created_by')
			.orderByRaw(`SUM(total) DESC`)
			.limit(5);

		return {
			// ─ core KPIs ─
			revenue:           Number(paymentsRow?.revenue ?? 0),
			discounts_given:   Number(paymentsRow?.discounts ?? 0),
			payments_count:    Number(paymentsRow?.n ?? 0),
			voided_amount:     Number(voidedRow?.voided_amount ?? 0),
			voided_count:      Number(voidedRow?.n ?? 0),
			outstanding_ar:    Number(outstandingRow?.outstanding ?? 0),
			outstanding_count: Number(outstandingRow?.n ?? 0),
			expenses:          Number(expensesRow?.expenses ?? 0),
			expenses_count:    Number(expensesRow?.n ?? 0),
			net_income:        Number(paymentsRow?.revenue ?? 0) - Number(expensesRow?.expenses ?? 0),
			// ─ transaction analytics ─
			avg_ticket:        Number(paymentsRow?.avg_ticket ?? 0),
			max_ticket:        Number(paymentsRow?.max_ticket ?? 0),
			min_ticket:        Number(paymentsRow?.min_ticket ?? 0),
			void_rate_pct:     Number(paymentsRow?.n ?? 0) + Number(voidedRow?.n ?? 0) > 0
				? Math.round((Number(voidedRow?.n ?? 0) /
					(Number(paymentsRow?.n ?? 0) + Number(voidedRow?.n ?? 0))) * 1000) / 10
				: 0,
			by_method: byMethod.map((r: any) => ({
				payment_method: r.payment_method,
				total: Number(r.total ?? 0),
				count: Number(r.count ?? 0),
			})),
			daily_trend: dailyTrend.map((r: any) => ({
				date: r.date,
				revenue: Number(r.revenue ?? 0),
				count: Number(r.count ?? 0),
			})),
			top_cashiers: topCashiers.map((r: any) => ({
				cashier: r.created_by || 'Unknown',
				revenue: Number(r.revenue ?? 0),
				count: Number(r.count ?? 0),
			})),
		};
	}

	// ─────────────────────── MONTHLY SUMMARY SALES ────────────────────────
	// 12-row array — one per month of the given year. Zero-fills empty months
	// so the frontend can render a clean Jan-Dec table without gaps.
	async monthlySales(tenant_uuid: string, year: number) {
		const knex = Payment.knex();
		const from = `${year}-01-01`;
		const to = `${year}-12-31 23:59:59`;

		const revRows = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.where('payment_date', '>=', from)
			.where('payment_date', '<=', to)
			.select(knex.raw(`EXTRACT(MONTH FROM payment_date) as m`))
			.sum({ revenue: 'total' })
			.sum({ discounts: 'discount_amount' })
			.count({ n: '*' })
			.groupByRaw(`EXTRACT(MONTH FROM payment_date)`);

		const expRows = await Expense.knex()('expenses')
			.where({ tenant_uuid, status: 'active' })
			.where('date_transact', '>=', from)
			.where('date_transact', '<=', `${year}-12-31`)
			.select(knex.raw(`EXTRACT(MONTH FROM date_transact::date) as m`))
			.sum({ expenses: 'amount' })
			.groupByRaw(`EXTRACT(MONTH FROM date_transact::date)`);

		const byMonth = new Map<number, any>();
		for (let m = 1; m <= 12; m++) byMonth.set(m, { month: m, revenue: 0, discounts: 0, count: 0, expenses: 0, net: 0 });
		for (const r of revRows as any[]) {
			const m = Number(r.m);
			const cur = byMonth.get(m);
			cur.revenue = Number(r.revenue ?? 0);
			cur.discounts = Number(r.discounts ?? 0);
			cur.count = Number(r.n ?? 0);
		}
		for (const r of expRows as any[]) {
			const m = Number(r.m);
			const cur = byMonth.get(m);
			cur.expenses = Number(r.expenses ?? 0);
		}
		for (const [, r] of byMonth) r.net = r.revenue - r.expenses;
		return { year, months: Array.from(byMonth.values()) };
	}

	// ───────────────────────── MONTHLY TEST REPORT ────────────────────────
	// Lab report throughput per month: how many reports were created, and of
	// those, how many are currently finalized vs voided. Draft = created but
	// not yet finalized. Bucketing is by created_at::date so the "created that
	// day" cohort is stable regardless of when a report is later finalized.
	async monthlyTests(tenant_uuid: string, year: number) {
		const knex = LabReport.knex();
		const from = `${year}-01-01`;
		const to = `${year}-12-31 23:59:59`;

		const rows = await knex('lab_reports')
			.where({ tenant_uuid })
			.where('created_at', '>=', from)
			.where('created_at', '<=', to)
			.select(knex.raw(`EXTRACT(MONTH FROM created_at) as m`))
			.select(knex.raw(`COUNT(*) as created`))
			.select(knex.raw(`COUNT(*) FILTER (WHERE status = 'finalized') as finalized`))
			.select(knex.raw(`COUNT(*) FILTER (WHERE status = 'voided') as voided`))
			.select(knex.raw(`COUNT(*) FILTER (WHERE status = 'draft') as draft`))
			.groupByRaw(`EXTRACT(MONTH FROM created_at)`);

		const byMonth = new Map<number, any>();
		for (let m = 1; m <= 12; m++) {
			byMonth.set(m, { month: m, created: 0, finalized: 0, voided: 0, draft: 0, finalized_pct: 0, voided_pct: 0 });
		}
		for (const r of rows as any[]) {
			const m = Number(r.m);
			const cur = byMonth.get(m);
			cur.created   = Number(r.created ?? 0);
			cur.finalized = Number(r.finalized ?? 0);
			cur.voided    = Number(r.voided ?? 0);
			cur.draft     = Number(r.draft ?? 0);
			cur.finalized_pct = cur.created > 0 ? Math.round((cur.finalized / cur.created) * 1000) / 10 : 0;
			cur.voided_pct    = cur.created > 0 ? Math.round((cur.voided    / cur.created) * 1000) / 10 : 0;
		}
		return { year, months: Array.from(byMonth.values()) };
	}

	// ─────────────────────────── CASHIER SALES ────────────────────────────
	// Sales grouped by cashier (payments.created_by). Great for shift close.
	async cashierSales(tenant_uuid: string, date_from?: string, date_to?: string, created_by?: string) {
		const knex = Payment.knex();
		const to = this.eod(date_to);
		const q = knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.modify(qb => { if (date_from) qb.where('payment_date', '>=', date_from); if (to) qb.where('payment_date', '<=', to); if (created_by) qb.where('created_by', created_by); })
			.select('created_by')
			.sum({ revenue: 'total' })
			.sum({ discounts: 'discount_amount' })
			.count({ count: '*' })
			.groupBy('created_by')
			.orderByRaw(`SUM(total) DESC`);
		const rows = await q;
		return rows.map((r: any) => ({
			cashier: r.created_by || 'Unknown',
			revenue: Number(r.revenue ?? 0),
			discounts_given: Number(r.discounts ?? 0),
			count: Number(r.count ?? 0),
		}));
	}

	// ────────────────────────────── VOIDS ─────────────────────────────────
	// Full row list of voided payments in the range. Includes who created +
	// who voided so ops can spot patterns.
	async voids(tenant_uuid: string, date_from?: string, date_to?: string, created_by?: string) {
		const knex = Payment.knex();
		const to = this.eod(date_to);
		const rows = await knex('payments as p')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'p.patient_case_uuid')
			.leftJoin('patients as pa', 'pa.uuid', 'p.patient_uuid')
			.where('p.tenant_uuid', tenant_uuid)
			.where('p.status', 'voided')
			.modify(qb => {
				if (date_from) qb.where('p.payment_date', '>=', date_from);
				if (to) qb.where('p.payment_date', '<=', to);
				if (created_by) qb.where('p.created_by', created_by);
			})
			.select(
				'p.uuid', 'p.payment_number', 'p.payment_date', 'p.payment_method',
				'p.total', 'p.notes', 'p.created_by', 'p.updated_by as voided_by', 'p.updated_at as voided_at',
				'pc.case_number as patient_case_number',
				'pa.first_name as patient_first_name', 'pa.last_name as patient_last_name',
			)
			.orderBy('p.payment_date', 'desc')
			.limit(500);
		const total = rows.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
		return { rows, total_voided: total, count: rows.length };
	}

	// ──────────────────────────── DAILY SALES ─────────────────────────────
	// One row per day: revenue, count, discounts, cash-only subtotal (for the
	// physical cashbox reconciliation).
	async dailySales(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const to = this.eod(date_to);
		const rows = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.modify(qb => { if (date_from) qb.where('payment_date', '>=', date_from); if (to) qb.where('payment_date', '<=', to); })
			.select(knex.raw(`to_char(payment_date::date, 'YYYY-MM-DD') as date`))
			.select(knex.raw(`COALESCE(SUM(total),0) as revenue`))
			.select(knex.raw(`COALESCE(SUM(discount_amount),0) as discounts`))
			.select(knex.raw(`COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END),0) as cash`))
			.select(knex.raw(`COUNT(*) as count`))
			.groupByRaw(`payment_date::date`)
			.orderByRaw(`payment_date::date`);
		return rows.map((r: any) => ({
			date: r.date,
			revenue: Number(r.revenue ?? 0),
			discounts: Number(r.discounts ?? 0),
			cash: Number(r.cash ?? 0),
			count: Number(r.count ?? 0),
		}));
	}

	// ─────────────────────── DAILY DETAILED SALES ────────────────────────
	// Per-payment row list with the test items itemized inside each row. Same
	// slice as Daily Sales (voided + arrangements excluded) but rendered as
	// individual transactions so a manager can eyeball every sale — who,
	// what tests, when, how paid. The frontend groups by day and computes
	// the per-day subtotal client-side. Capped so a wild range doesn't OOM.
	async dailyDetailedSales(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const to = this.eod(date_to);
		const payments = await knex('payments as p')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'p.patient_case_uuid')
			.leftJoin('patients as pa', 'pa.uuid', 'p.patient_uuid')
			.where('p.tenant_uuid', tenant_uuid)
			.where('p.status', 'completed')
			.whereNotIn('p.payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.modify(qb => { if (date_from) qb.where('p.payment_date', '>=', date_from); if (to) qb.where('p.payment_date', '<=', to); })
			.select(
				'p.uuid', 'p.payment_number', 'p.payment_date',
				'p.subtotal', 'p.discount_amount', 'p.total',
				'p.payment_method', 'p.channel', 'p.reference',
				'p.amount_tendered', 'p.change_amount',
				'p.discount_code', 'p.created_by',
				'pc.case_number as patient_case_number',
				'pa.patient_number', 'pa.first_name as patient_first_name',
				'pa.middle_name as patient_middle_name', 'pa.last_name as patient_last_name',
			)
			.orderBy('p.payment_date', 'desc')
			.limit(1000);

		if (!payments.length) return [];

		// Batch-fetch every payment_item for the returned payments so we
		// avoid an N+1. Group them into a Map keyed by payment_uuid.
		const paymentUuids = payments.map((p: any) => p.uuid);
		const itemRows = await PaymentItem.knex()('payment_items')
			.whereIn('payment_uuid', paymentUuids)
			.orderBy([{ column: 'display_order', order: 'asc' }, { column: 'created_at', order: 'asc' }])
			.select('payment_uuid', 'code', 'name', 'quantity', 'unit_price', 'line_total', 'line_discount_amount', 'line_selling_price', 'package_code');

		const itemsByPayment = new Map<string, any[]>();
		for (const it of itemRows as any[]) {
			const list = itemsByPayment.get(it.payment_uuid) || [];
			list.push({
				code: it.code,
				name: it.name,
				quantity: Number(it.quantity ?? 0),
				unit_price: Number(it.unit_price ?? 0),
				line_total: Number(it.line_total ?? 0),
				line_discount_amount: Number(it.line_discount_amount ?? 0),
				line_selling_price: Number(it.line_selling_price ?? 0),
				package_code: it.package_code || null,
			});
			itemsByPayment.set(it.payment_uuid, list);
		}

		return payments.map((r: any) => ({
			...r,
			subtotal: Number(r.subtotal ?? 0),
			discount_amount: Number(r.discount_amount ?? 0),
			total: Number(r.total ?? 0),
			amount_tendered: r.amount_tendered != null ? Number(r.amount_tendered) : null,
			change_amount: r.change_amount != null ? Number(r.change_amount) : null,
			items: itemsByPayment.get(r.uuid) || [],
		}));
	}

	// ───────────────────────────── DISCOUNTS ──────────────────────────────
	// Discount usage: which discount codes were applied, how many times, and
	// how much revenue they gave away.
	async discounts(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const to = this.eod(date_to);
		const rows = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotNull('discount_uuid')
			.modify(qb => { if (date_from) qb.where('payment_date', '>=', date_from); if (to) qb.where('payment_date', '<=', to); })
			.select('discount_code', 'discount_name', 'discount_type')
			.sum({ discount_amount: 'discount_amount' })
			.sum({ subtotal: 'subtotal' })
			.count({ count: '*' })
			.groupBy('discount_code', 'discount_name', 'discount_type')
			.orderByRaw(`SUM(discount_amount) DESC`);
		const total_discount = rows.reduce((s: number, r: any) => s + Number(r.discount_amount || 0), 0);
		return {
			rows: rows.map((r: any) => ({
				code: r.discount_code,
				name: r.discount_name,
				type: r.discount_type,
				discount_amount: Number(r.discount_amount ?? 0),
				subtotal: Number(r.subtotal ?? 0),
				count: Number(r.count ?? 0),
			})),
			total_discount,
		};
	}

	// ────────────────────────── PAYMENT SUMMARY ───────────────────────────
	// Breakdown by payment_method + status. Includes voided so ops can see
	// full method activity.
	async paymentSummary(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const to = this.eod(date_to);
		const rows = await knex('payments')
			.where({ tenant_uuid })
			.modify(qb => { if (date_from) qb.where('payment_date', '>=', date_from); if (to) qb.where('payment_date', '<=', to); })
			.select('payment_method', 'status')
			.sum({ total: 'total' })
			.count({ count: '*' })
			.groupBy('payment_method', 'status')
			.orderBy('payment_method');
		return rows.map((r: any) => ({
			payment_method: r.payment_method,
			status: r.status,
			total: Number(r.total ?? 0),
			count: Number(r.count ?? 0),
		}));
	}

	// ─────────────────────────── EXPENSE REPORT ──────────────────────────
	// Full expense breakdown for the range. Returns row list + per-category
	// totals + grand total. Optional `category` narrows to a single bucket.
	// Voided expenses are included but marked so the frontend can dim them;
	// the grand total excludes voided rows.
	async expenses(tenant_uuid: string, date_from?: string, date_to?: string, category?: string) {
		const knex = Expense.knex();
		const rows = await knex('expenses')
			.where({ tenant_uuid })
			.modify(qb => {
				if (date_from) qb.where('date_transact', '>=', date_from);
				if (date_to)   qb.where('date_transact', '<=', date_to);
				if (category)  qb.where('category', category);
			})
			.orderBy('date_transact', 'desc')
			.orderBy('created_at', 'desc')
			.limit(500);

		// Category totals (active only — void doesn't count as spend).
		const catRows = await knex('expenses')
			.where({ tenant_uuid, status: 'active' })
			.modify(qb => {
				if (date_from) qb.where('date_transact', '>=', date_from);
				if (date_to)   qb.where('date_transact', '<=', date_to);
				if (category)  qb.where('category', category);
			})
			.select('category')
			.sum({ total: 'amount' })
			.count({ count: '*' })
			.groupBy('category')
			.orderByRaw(`SUM(amount) DESC`);

		const grandTotal = catRows.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
		const voidedTotal = rows
			.filter((r: any) => (r.status || '').toLowerCase() === 'void')
			.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

		return {
			rows: rows.map((r: any) => ({ ...r, amount: Number(r.amount ?? 0) })),
			by_category: catRows.map((r: any) => ({
				category: r.category,
				total: Number(r.total ?? 0),
				count: Number(r.count ?? 0),
			})),
			grand_total: grandTotal,
			voided_total: voidedTotal,
			count: rows.length,
		};
	}

	// ────────────────────────── DAILY TESTS ───────────────────────────────
	// Lab report throughput per day: created that day + how many of that
	// same-day cohort are currently finalized vs voided (draft = the rest).
	// Powers the Daily Test report — sibling to Daily Sales but sliced from
	// lab_reports so it tracks lab output rather than billing.
	async dailyTests(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = LabReport.knex();
		const to = this.eod(date_to);
		const rows = await knex('lab_reports')
			.where({ tenant_uuid })
			.modify(qb => { if (date_from) qb.where('created_at', '>=', date_from); if (to) qb.where('created_at', '<=', to); })
			.select(knex.raw(`to_char(created_at::date, 'YYYY-MM-DD') as date`))
			.select(knex.raw(`COUNT(*) as created`))
			.select(knex.raw(`COUNT(*) FILTER (WHERE status = 'finalized') as finalized`))
			.select(knex.raw(`COUNT(*) FILTER (WHERE status = 'voided') as voided`))
			.select(knex.raw(`COUNT(*) FILTER (WHERE status = 'draft') as draft`))
			.groupByRaw(`created_at::date`)
			.orderByRaw(`created_at::date`);
		return rows.map((r: any) => {
			const created   = Number(r.created ?? 0);
			const finalized = Number(r.finalized ?? 0);
			const voided    = Number(r.voided ?? 0);
			const draft     = Number(r.draft ?? 0);
			return {
				date: r.date,
				created, finalized, voided, draft,
				finalized_pct: created > 0 ? Math.round((finalized / created) * 1000) / 10 : 0,
				voided_pct:    created > 0 ? Math.round((voided    / created) * 1000) / 10 : 0,
			};
		});
	}

	// ─────────────────────── TEST ANALYTICS — VOLUME ──────────────────────
	// Daily test volume timeseries + top 20 tests by count and revenue.
	async testVolume(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = PaymentItem.knex();
		const to = this.eod(date_to);

		const daily = await knex('payment_items as pi')
			.innerJoin('payments as p', 'p.uuid', 'pi.payment_uuid')
			.where('pi.tenant_uuid', tenant_uuid)
			.where('p.status', 'completed')
			.modify(qb => { if (date_from) qb.where('p.payment_date', '>=', date_from); if (to) qb.where('p.payment_date', '<=', to); })
			.select(knex.raw(`to_char(p.payment_date::date, 'YYYY-MM-DD') as date`))
			.sum({ qty: 'pi.quantity' })
			.count({ orders: '*' })
			.groupByRaw(`p.payment_date::date`)
			.orderByRaw(`p.payment_date::date`);

		const top = await knex('payment_items as pi')
			.innerJoin('payments as p', 'p.uuid', 'pi.payment_uuid')
			.where('pi.tenant_uuid', tenant_uuid)
			.where('p.status', 'completed')
			.modify(qb => { if (date_from) qb.where('p.payment_date', '>=', date_from); if (to) qb.where('p.payment_date', '<=', to); })
			.select('pi.code', 'pi.name')
			.sum({ qty: 'pi.quantity' })
			.sum({ revenue: 'pi.line_selling_price' })
			.count({ orders: '*' })
			.groupBy('pi.code', 'pi.name')
			.orderByRaw(`SUM(pi.quantity) DESC`)
			.limit(20);

		return {
			daily: daily.map((r: any) => ({ date: r.date, qty: Number(r.qty ?? 0), orders: Number(r.orders ?? 0) })),
			top: top.map((r: any) => ({
				code: r.code, name: r.name,
				qty: Number(r.qty ?? 0), revenue: Number(r.revenue ?? 0), orders: Number(r.orders ?? 0),
			})),
		};
	}

	// ─────────────────── TEST ANALYTICS — CATEGORY MIX ────────────────────
	// Category-level volume + revenue. Joined via test_items → item_categories.
	async testCategoryMix(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = PaymentItem.knex();
		const to = this.eod(date_to);
		const rows = await knex('payment_items as pi')
			.innerJoin('payments as p', 'p.uuid', 'pi.payment_uuid')
			.leftJoin('test_items as ti', function () {
				this.on('ti.tenant_uuid', '=', 'pi.tenant_uuid').andOn('ti.code', '=', 'pi.code');
			})
			.leftJoin('item_categories as ic', 'ic.uuid', 'ti.item_category_uuid')
			.leftJoin('item_groups as ig', 'ig.uuid', 'ic.item_group_uuid')
			.where('pi.tenant_uuid', tenant_uuid)
			.where('p.status', 'completed')
			.modify(qb => { if (date_from) qb.where('p.payment_date', '>=', date_from); if (to) qb.where('p.payment_date', '<=', to); })
			.select(
				knex.raw(`COALESCE(ig.name, 'Uncategorized') as group_name`),
				knex.raw(`COALESCE(ic.name, 'Uncategorized') as category_name`),
			)
			.sum({ qty: 'pi.quantity' })
			.sum({ revenue: 'pi.line_selling_price' })
			.count({ orders: '*' })
			.groupBy('group_name', 'category_name')
			.orderByRaw(`SUM(pi.line_selling_price) DESC`);
		return rows.map((r: any) => ({
			group_name: r.group_name,
			category_name: r.category_name,
			qty: Number(r.qty ?? 0),
			revenue: Number(r.revenue ?? 0),
			orders: Number(r.orders ?? 0),
		}));
	}

	// ───────────────────── TEST ANALYTICS — TAT ───────────────────────────
	// Turnaround time: requisition_date → lab_report.finalized_at (only
	// finalized reports; drafts / voided ignored). Aggregated per category
	// with median and p95 in hours.
	async testTAT(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = LabReport.knex();
		const to = this.eod(date_to);
		const rows = await knex('lab_reports as lr')
			.innerJoin('patient_requisitions as pr', 'pr.uuid', 'lr.patient_requisition_uuid')
			.where('lr.tenant_uuid', tenant_uuid)
			.where('lr.status', 'finalized')
			.whereNotNull('lr.finalized_at')
			.modify(qb => {
				if (date_from) qb.where('lr.finalized_at', '>=', date_from);
				if (to) qb.where('lr.finalized_at', '<=', to);
			})
			.select(knex.raw(`COALESCE(lr.item_category_name, 'Uncategorized') as category_name`))
			.select(knex.raw(`percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (lr.finalized_at - pr.requisition_date))/3600.0) as median_hours`))
			.select(knex.raw(`percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (lr.finalized_at - pr.requisition_date))/3600.0) as p95_hours`))
			.select(knex.raw(`COALESCE(AVG(EXTRACT(EPOCH FROM (lr.finalized_at - pr.requisition_date))/3600.0), 0) as avg_hours`))
			.count({ count: '*' })
			.groupBy('category_name')
			.orderByRaw(`percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (lr.finalized_at - pr.requisition_date))/3600.0) DESC`);
		return rows.map((r: any) => ({
			category_name: r.category_name,
			median_hours: Number(r.median_hours ?? 0),
			p95_hours: Number(r.p95_hours ?? 0),
			avg_hours: Number(r.avg_hours ?? 0),
			count: Number(r.count ?? 0),
		}));
	}
}
