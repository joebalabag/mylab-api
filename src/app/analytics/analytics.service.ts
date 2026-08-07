import { Injectable } from '@nestjs/common';
import { Payment } from '../payment/payment.model';
import { PaymentItem } from '../payment/payment-item.model';
import { PatientCase } from '../patient-case/patient-case.model';
import { PatientRequisition } from '../patient-requisition/patient-requisition.model';
import { Expense } from '../expense/expense.model';
import {
	ARRANGEMENT_PAYMENT_METHODS,
	SELF_RESOLVING_ARRANGEMENTS,
} from '../payment/payment.model';

/**
 * Analytics aggregations for the tenant-side dashboard. Every method takes
 * a tenant_uuid + inclusive date range and returns numbers ready for the
 * frontend to render into KPIs / charts.
 *
 * Conventions:
 *  - `date_from` is `YYYY-MM-DD 00:00:00`, `date_to` is `YYYY-MM-DD 23:59:59`
 *    so filters mirror the existing payment.service dashboard bounds.
 *  - Voided payments never count toward revenue anywhere.
 *  - "Arrangements" means payment_method IN accounts_receivable / insurance
 *    / paid_outside / other. Charity is an arrangement but self-resolves so
 *    it isn't counted as "outstanding".
 */
@Injectable()
export class AnalyticsService {
	private endOfDay(d?: string): string | undefined {
		return d ? `${d} 23:59:59` : undefined;
	}

	/**
	 * Big-number KPIs: revenue collected (cash-in-hand + settled arrangements),
	 * still-outstanding arrangement amount, and today's cash-in-hand for the
	 * "collected today" cashbox check. Voided rows excluded from all sums.
	 */
	async revenueSummary(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const dateTo = this.endOfDay(date_to);
		const nowDay = new Date().toISOString().slice(0, 10);

		// Total collected across the range (completed rows, includes both
		// cash-in-hand methods and any arrangements that have been resolved).
		// For arrangements we only count the amount if arrangement_resolved_at
		// falls in the range too — otherwise we'd claim revenue that isn't in.
		const collectedRow: any = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.modify((qb) => {
				if (date_from) qb.where('payment_date', '>=', date_from);
				if (dateTo) qb.where('payment_date', '<=', dateTo);
			})
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.select(knex.raw(`COALESCE(SUM(total), 0) as total, COUNT(*) as n`))
			.first();

		// Arrangements that resolved inside the range → count as collected too.
		const resolvedArrangementsRow: any = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.whereNotNull('arrangement_resolved_at')
			.modify((qb) => {
				if (date_from) qb.where('arrangement_resolved_at', '>=', date_from);
				if (dateTo) qb.where('arrangement_resolved_at', '<=', dateTo);
			})
			.select(knex.raw(`COALESCE(SUM(total), 0) as total, COUNT(*) as n`))
			.first();

		// Still-outstanding arrangements (not yet resolved). No date filter —
		// these are a running liability, "as-of now" is what matters.
		const outstandingRow: any = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.whereNotIn('payment_method', SELF_RESOLVING_ARRANGEMENTS as unknown as string[])
			.whereNull('arrangement_resolved_at')
			.select(knex.raw(`COALESCE(SUM(total), 0) as total, COUNT(*) as n`))
			.first();

		// Cash-in-hand today (for the cashbox reconciliation glance).
		const todayCashRow: any = await knex('payments')
			.where({ tenant_uuid, status: 'completed', payment_method: 'cash' })
			.where('payment_date', '>=', nowDay)
			.where('payment_date', '<=', `${nowDay} 23:59:59`)
			.select(knex.raw(`COALESCE(SUM(total), 0) as total, COUNT(*) as n`))
			.first();

		return {
			collected_total: Number(collectedRow?.total ?? 0) + Number(resolvedArrangementsRow?.total ?? 0),
			collected_count: Number(collectedRow?.n ?? 0) + Number(resolvedArrangementsRow?.n ?? 0),
			outstanding_total: Number(outstandingRow?.total ?? 0),
			outstanding_count: Number(outstandingRow?.n ?? 0),
			today_cash_total: Number(todayCashRow?.total ?? 0),
			today_cash_count: Number(todayCashRow?.n ?? 0),
		};
	}

	/** Daily revenue timeseries for the line chart. */
	async revenueTrend(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const dateTo = this.endOfDay(date_to);
		const rows = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.modify((qb) => {
				if (date_from) qb.where('payment_date', '>=', date_from);
				if (dateTo) qb.where('payment_date', '<=', dateTo);
			})
			.select(knex.raw(`to_char(payment_date::date, 'YYYY-MM-DD') as date`))
			.sum({ revenue: 'total' })
			.count({ count: '*' })
			.groupByRaw(`payment_date::date`)
			.orderByRaw(`payment_date::date`);
		return rows.map((r: any) => ({
			date: r.date,
			revenue: Number(r.revenue ?? 0),
			count: Number(r.count ?? 0),
		}));
	}

	/** Split of collected revenue by payment method (for the doughnut). */
	async methodBreakdown(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const dateTo = this.endOfDay(date_to);
		const rows = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.modify((qb) => {
				if (date_from) qb.where('payment_date', '>=', date_from);
				if (dateTo) qb.where('payment_date', '<=', dateTo);
			})
			.select('payment_method')
			.sum({ total: 'total' })
			.count({ count: '*' })
			.groupBy('payment_method')
			.orderByRaw(`SUM(total) DESC`);
		return rows.map((r: any) => ({
			payment_method: r.payment_method,
			total: Number(r.total ?? 0),
			count: Number(r.count ?? 0),
		}));
	}

	/**
	 * Outstanding arrangements with aging buckets, top counter-parties, and
	 * a "oldest pending" list. Everything computed off the same table scan so
	 * the frontend can render three sub-widgets in one round-trip.
	 */
	async receivablesAging(tenant_uuid: string, limit: number = 10) {
		const knex = Payment.knex();

		// Aging buckets — days since payment_date until now.
		const bucketsRow: any = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.whereNotIn('payment_method', SELF_RESOLVING_ARRANGEMENTS as unknown as string[])
			.whereNull('arrangement_resolved_at')
			.select(
				knex.raw(`
					COALESCE(SUM(CASE WHEN (now()::date - payment_date::date) <= 30 THEN total ELSE 0 END), 0) AS bucket_0_30,
					COALESCE(SUM(CASE WHEN (now()::date - payment_date::date) BETWEEN 31 AND 60 THEN total ELSE 0 END), 0) AS bucket_31_60,
					COALESCE(SUM(CASE WHEN (now()::date - payment_date::date) BETWEEN 61 AND 90 THEN total ELSE 0 END), 0) AS bucket_61_90,
					COALESCE(SUM(CASE WHEN (now()::date - payment_date::date) > 90 THEN total ELSE 0 END), 0) AS bucket_over_90,
					COALESCE(SUM(total), 0) AS grand_total,
					COUNT(*) AS n
				`),
			)
			.first();

		// Top billed_to counter-parties (companies / guarantors).
		const byBilledTo = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.whereNotIn('payment_method', SELF_RESOLVING_ARRANGEMENTS as unknown as string[])
			.whereNull('arrangement_resolved_at')
			.whereNotNull('billed_to')
			.where('billed_to', '<>', '')
			.select('billed_to')
			.sum({ total: 'total' })
			.count({ count: '*' })
			.groupBy('billed_to')
			.orderByRaw(`SUM(total) DESC`)
			.limit(limit);

		// Oldest pending — actionable row list (click through to resolve).
		const oldest = await knex('payments as p')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'p.patient_case_uuid')
			.leftJoin('patients as pa', 'pa.uuid', 'p.patient_uuid')
			.where('p.tenant_uuid', tenant_uuid)
			.where('p.status', 'completed')
			.whereIn('p.payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.whereNotIn('p.payment_method', SELF_RESOLVING_ARRANGEMENTS as unknown as string[])
			.whereNull('p.arrangement_resolved_at')
			.select(
				'p.uuid',
				'p.payment_number',
				'p.payment_date',
				'p.payment_method',
				'p.total',
				'p.billed_to',
				'p.reference',
				'pc.case_number as patient_case_number',
				'pa.first_name as patient_first_name',
				'pa.last_name as patient_last_name',
				knex.raw(`(now()::date - p.payment_date::date) AS age_days`),
			)
			.orderBy('p.payment_date', 'asc')
			.limit(limit);

		return {
			totals: {
				bucket_0_30: Number(bucketsRow?.bucket_0_30 ?? 0),
				bucket_31_60: Number(bucketsRow?.bucket_31_60 ?? 0),
				bucket_61_90: Number(bucketsRow?.bucket_61_90 ?? 0),
				bucket_over_90: Number(bucketsRow?.bucket_over_90 ?? 0),
				grand_total: Number(bucketsRow?.grand_total ?? 0),
				count: Number(bucketsRow?.n ?? 0),
			},
			by_billed_to: byBilledTo.map((r: any) => ({
				billed_to: r.billed_to,
				total: Number(r.total ?? 0),
				count: Number(r.count ?? 0),
			})),
			oldest: oldest.map((r: any) => ({
				...r,
				total: Number(r.total ?? 0),
				age_days: Number(r.age_days ?? 0),
			})),
		};
	}

	/** Cases created + requisitions finalized per day. */
	async throughput(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = PatientCase.knex();
		const dateTo = this.endOfDay(date_to);

		const cases = await knex('patient_cases')
			.where({ tenant_uuid })
			.modify((qb) => {
				if (date_from) qb.where('admission_date', '>=', date_from);
				if (dateTo) qb.where('admission_date', '<=', dateTo);
			})
			.select(knex.raw(`to_char(admission_date::date, 'YYYY-MM-DD') as date`))
			.count({ n: '*' })
			.groupByRaw(`admission_date::date`);

		const reqs = await knex('patient_requisitions')
			.where({ tenant_uuid })
			.whereIn('status', ['finalized', 'partially_paid', 'paid'])
			.modify((qb) => {
				if (date_from) qb.where('requisition_date', '>=', date_from);
				if (dateTo) qb.where('requisition_date', '<=', dateTo);
			})
			.select(knex.raw(`to_char(requisition_date::date, 'YYYY-MM-DD') as date`))
			.count({ n: '*' })
			.groupByRaw(`requisition_date::date`);

		// Merge both series by date.
		const map = new Map<string, { date: string; cases: number; requisitions: number }>();
		for (const r of cases as any[]) map.set(r.date, { date: r.date, cases: Number(r.n), requisitions: 0 });
		for (const r of reqs as any[]) {
			const cur = map.get(r.date) || { date: r.date, cases: 0, requisitions: 0 };
			cur.requisitions = Number(r.n);
			map.set(r.date, cur);
		}
		return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
	}

	/** Top-N test items ranked by revenue (secondary sort: count). */
	async topItems(tenant_uuid: string, date_from?: string, date_to?: string, limit: number = 10) {
		const knex = PaymentItem.knex();
		const dateTo = this.endOfDay(date_to);
		const rows = await knex('payment_items as pi')
			.innerJoin('payments as p', 'p.uuid', 'pi.payment_uuid')
			.where('pi.tenant_uuid', tenant_uuid)
			.where('p.status', 'completed')
			.modify((qb) => {
				if (date_from) qb.where('p.payment_date', '>=', date_from);
				if (dateTo) qb.where('p.payment_date', '<=', dateTo);
			})
			.select('pi.code', 'pi.name')
			.sum({ revenue: 'pi.line_selling_price' })
			.sum({ qty: 'pi.quantity' })
			.count({ orders: '*' })
			.groupBy('pi.code', 'pi.name')
			.orderByRaw(`SUM(pi.line_selling_price) DESC, COUNT(*) DESC`)
			.limit(limit);
		return rows.map((r: any) => ({
			code: r.code,
			name: r.name,
			revenue: Number(r.revenue ?? 0),
			qty: Number(r.qty ?? 0),
			orders: Number(r.orders ?? 0),
		}));
	}

	/** Revenue vs expenses per day + totals, so the frontend can plot both. */
	async profitability(tenant_uuid: string, date_from?: string, date_to?: string) {
		const knex = Payment.knex();
		const dateTo = this.endOfDay(date_to);

		const revRows = await knex('payments')
			.where({ tenant_uuid, status: 'completed' })
			.whereNotIn('payment_method', ARRANGEMENT_PAYMENT_METHODS as unknown as string[])
			.modify((qb) => {
				if (date_from) qb.where('payment_date', '>=', date_from);
				if (dateTo) qb.where('payment_date', '<=', dateTo);
			})
			.select(knex.raw(`to_char(payment_date::date, 'YYYY-MM-DD') as date`))
			.sum({ revenue: 'total' })
			.groupByRaw(`payment_date::date`);

		const expRows = await Expense.knex()('expenses')
			.where({ tenant_uuid, status: 'active' })
			.modify((qb) => {
				if (date_from) qb.where('date_transact', '>=', date_from);
				if (date_to) qb.where('date_transact', '<=', date_to);
			})
			.select('date_transact as date')
			.sum({ expense: 'amount' })
			.groupBy('date_transact');

		const map = new Map<string, { date: string; revenue: number; expenses: number }>();
		for (const r of revRows as any[]) {
			map.set(r.date, { date: r.date, revenue: Number(r.revenue ?? 0), expenses: 0 });
		}
		for (const r of expRows as any[]) {
			const key = String(r.date);
			const cur = map.get(key) || { date: key, revenue: 0, expenses: 0 };
			cur.expenses = Number(r.expense ?? 0);
			map.set(key, cur);
		}
		const by_day = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
		const revenue = by_day.reduce((s, r) => s + r.revenue, 0);
		const expenses = by_day.reduce((s, r) => s + r.expenses, 0);
		return { revenue, expenses, net: revenue - expenses, by_day };
	}
}
