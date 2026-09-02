import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { Tenant } from '../tenant/tenant.model';
import { PatientCase } from '../patient-case/patient-case.model';
import { PatientRequisition } from '../patient-requisition/patient-requisition.model';
import { PatientRequisitionItem } from '../patient-requisition/patient-requisition-item.model';
import { Discount } from '../discount/discount.model';
import {
	Payment,
	ARRANGEMENT_PAYMENT_METHODS,
	CHANNELED_PAYMENT_METHODS,
	RESOLUTION_METHODS,
	SELF_RESOLVING_ARRANGEMENTS,
} from './payment.model';
import { PaymentItem } from './payment-item.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import {
	CreatePaymentDTO,
	PaymentDashboardQueryDTO,
	ResolveArrangementDTO,
	UnpaidCasesQueryDTO,
	UnpaidItemsQueryDTO,
} from './dto/payment.dto';

export interface PaymentWithContext extends Payment {
	patient_case_number?: string | null;
	patient_case_type?: string | null;
	patient_number?: string | null;
	patient_first_name?: string | null;
	patient_middle_name?: string | null;
	patient_last_name?: string | null;
	patient_suffix?: string | null;
	items?: PaymentItem[];
}

@Injectable()
export class PaymentService {
	async listDashboard(filters: PaymentDashboardQueryDTO): Promise<PagedResult<PaymentWithContext>> {
		const query = Payment.query()
			.alias('p')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'p.patient_case_uuid')
			.leftJoin('patients as pa', 'pa.uuid', 'p.patient_uuid')
			.select(
				'p.*',
				'pc.case_number as patient_case_number',
				'pc.case_type as patient_case_type',
				'pa.patient_number as patient_number',
				'pa.first_name as patient_first_name',
				'pa.middle_name as patient_middle_name',
				'pa.last_name as patient_last_name',
				'pa.suffix as patient_suffix',
			)
			.orderBy('p.payment_date', 'desc');

		if (filters.tenant_uuid) query.where('p.tenant_uuid', filters.tenant_uuid);
		if (filters.patient_case_uuid) query.where('p.patient_case_uuid', filters.patient_case_uuid);
		if (filters.patient_uuid) query.where('p.patient_uuid', filters.patient_uuid);
		if (filters.payment_method) query.where('p.payment_method', filters.payment_method);
		if (filters.date_from) query.where('p.payment_date', '>=', filters.date_from);
		if (filters.date_to) query.where('p.payment_date', '<=', `${filters.date_to} 23:59:59`);
		if (filters.status && filters.status.length) query.whereIn('p.status', filters.status);
		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('p.payment_number', 'ilike', kw)
					.orWhere('pc.case_number', 'ilike', kw)
					.orWhere('pa.patient_number', 'ilike', kw)
					.orWhere('pa.first_name', 'ilike', kw)
					.orWhere('pa.last_name', 'ilike', kw);
			});
		}

		return applyPagination<PaymentWithContext>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<PaymentWithContext | undefined> {
		const parent = (await Payment.query()
			.alias('p')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'p.patient_case_uuid')
			.leftJoin('patients as pa', 'pa.uuid', 'p.patient_uuid')
			.select(
				'p.*',
				'pc.case_number as patient_case_number',
				'pc.case_type as patient_case_type',
				'pa.patient_number as patient_number',
				'pa.first_name as patient_first_name',
				'pa.middle_name as patient_middle_name',
				'pa.last_name as patient_last_name',
				'pa.suffix as patient_suffix',
			)
			.findOne({ 'p.uuid': uuid })) as unknown as PaymentWithContext | undefined;
		if (!parent) return undefined;

		const items = (await PaymentItem.query()
			.where({ payment_uuid: uuid })
			.orderBy([
				{ column: 'display_order', order: 'asc' },
				{ column: 'created_at', order: 'asc' },
			])) as unknown as PaymentItem[];

		return { ...(parent as any), items } as PaymentWithContext;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	/**
	 * List cases that have at least one unpaid finalized (or partially paid)
	 * requisition item — powers the search-first case picker in the cashier
	 * "New Payment" flow. Includes each case's outstanding balance.
	 */
	async listUnpaidCases(filters: UnpaidCasesQueryDTO & { tenant_uuid: string }): Promise<any[]> {
		const knex = PatientCase.knex();
		const kw = filters.keywords ? `%${filters.keywords}%` : null;
		const rows = await knex('patient_cases as pc')
			.leftJoin('patients as pa', 'pa.uuid', 'pc.patient_uuid')
			.select(
				'pc.uuid as case_uuid',
				'pc.case_number',
				'pc.case_type',
				'pc.admission_date',
				'pa.uuid as patient_uuid',
				'pa.patient_number',
				'pa.first_name',
				'pa.middle_name',
				'pa.last_name',
				'pa.suffix',
				'pa.sex',
				'pa.birthdate',
				knex.raw(
					`COALESCE(SUM(pri.line_selling_price), 0) AS unpaid_total`,
				),
				knex.raw(`COUNT(pri.uuid) AS unpaid_count`),
			)
			.innerJoin('patient_requisitions as pr', 'pr.patient_case_uuid', 'pc.uuid')
			.innerJoin('patient_requisition_items as pri', 'pri.patient_requisition_uuid', 'pr.uuid')
			.where('pc.tenant_uuid', filters.tenant_uuid)
			.whereIn('pr.status', ['finalized', 'partially_paid'])
			.whereNull('pri.payment_uuid')
			.modify((qb) => {
				if (kw) {
					qb.where((sub) => {
						sub.where('pc.case_number', 'ilike', kw)
							.orWhere('pa.patient_number', 'ilike', kw)
							.orWhere('pa.first_name', 'ilike', kw)
							.orWhere('pa.last_name', 'ilike', kw);
					});
				}
			})
			.groupBy(
				'pc.uuid', 'pc.case_number', 'pc.case_type', 'pc.admission_date',
				'pa.uuid', 'pa.patient_number', 'pa.first_name', 'pa.middle_name',
				'pa.last_name', 'pa.suffix', 'pa.sex', 'pa.birthdate',
			)
			.orderBy('pc.admission_date', 'desc')
			.limit(40);
		return rows;
	}

	/**
	 * Unpaid requisition items for a specific case, joined against the
	 * requisition (for req_number / date) so the cashier UI can group them.
	 */
	async listUnpaidItems(filters: UnpaidItemsQueryDTO & { tenant_uuid: string }): Promise<any[]> {
		const knex = PatientRequisitionItem.knex();
		return knex('patient_requisition_items as pri')
			.innerJoin('patient_requisitions as pr', 'pr.uuid', 'pri.patient_requisition_uuid')
			.where('pri.tenant_uuid', filters.tenant_uuid)
			.where('pr.patient_case_uuid', filters.patient_case_uuid)
			.whereIn('pr.status', ['finalized', 'partially_paid'])
			.whereNull('pri.payment_uuid')
			.orderBy([
				{ column: 'pr.requisition_date', order: 'asc' },
				{ column: 'pri.display_order', order: 'asc' },
			])
			.select(
				'pri.*',
				'pr.requisition_number as requisition_number',
				'pr.requisition_date as requisition_date',
				'pr.status as requisition_status',
			);
	}

	/**
	 * Race-safe per-tenant payment_number. Format: "PAY-NNNNNN".
	 */
	private async nextPaymentNumber(trx: any, tenant_uuid: string): Promise<string> {
		await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`payment-number:${tenant_uuid}`]);
		const maxRow = (await Payment.query(trx)
			.where({ tenant_uuid })
			.max('payment_number as max_num')
			.first()) as { max_num?: string } | undefined;
		let next = 1;
		if (maxRow?.max_num) {
			const match = String(maxRow.max_num).match(/(\d+)$/);
			if (match) next = parseInt(match[1], 10) + 1;
		}
		return `PAY-${String(next).padStart(6, '0')}`;
	}

	/**
	 * Create a payment atomically:
	 *   1. Validate case + items belong to tenant, all unpaid, all from
	 *      finalized/partially_paid requisitions.
	 *   2. Compute payment-level discount amount (percent/fix/open_amount).
	 *   3. Distribute discount across items proportionally by line_total.
	 *   4. Insert payment + payment_items with paid snapshots.
	 *   5. Mark each requisition_item.payment_uuid + paid_at.
	 *   6. Recompute each affected requisition's status:
	 *        all items paid → 'paid'
	 *        some paid      → 'partially_paid'
	 *        none paid      → left as 'finalized' (no change)
	 */
	async createPayment(
		data: CreatePaymentDTO & { tenant_uuid: string; created_by: string },
	): Promise<PaymentWithContext> {
		const knex = Payment.knex();
		// Return the uuid from inside the transaction; do the join-loaded
		// re-fetch AFTER commit so findByUuid (uses a separate connection)
		// can actually see the freshly-inserted row.
		const paymentUuid: string = await objectionTransaction(knex, async (trx) => {
			const kase = (await PatientCase.query(trx).findOne({
				uuid: data.patient_case_uuid,
				tenant_uuid: data.tenant_uuid,
			})) as unknown as PatientCase | undefined;
			if (!kase) throw new BadRequestException('Patient case not found or belongs to a different tenant.');

			// Load the target items with their parent requisitions for validation.
			const itemUuids = Array.from(new Set(data.items.map((i) => i.patient_requisition_item_uuid)));
			if (!itemUuids.length) throw new BadRequestException('At least one item required.');

			const items = (await PatientRequisitionItem.query(trx)
				.alias('pri')
				.innerJoin('patient_requisitions as pr', 'pr.uuid', 'pri.patient_requisition_uuid')
				.select(
					'pri.*',
					'pr.status as requisition_status',
					'pr.patient_case_uuid as requisition_case_uuid',
					'pr.tenant_uuid as requisition_tenant_uuid',
				)
				.whereIn('pri.uuid', itemUuids)) as unknown as any[];

			if (items.length !== itemUuids.length) {
				throw new BadRequestException('One or more requisition items not found.');
			}
			for (const it of items) {
				if (it.requisition_tenant_uuid !== data.tenant_uuid) {
					throw new BadRequestException('Item belongs to a different tenant.');
				}
				if (it.requisition_case_uuid !== data.patient_case_uuid) {
					throw new BadRequestException('Item belongs to a different case.');
				}
				if (it.payment_uuid) {
					throw new BadRequestException(`Item ${it.code} is already paid.`);
				}
				if (!['finalized', 'partially_paid'].includes(String(it.requisition_status))) {
					throw new BadRequestException(
						`Item ${it.code} belongs to a requisition that is not finalized (status=${it.requisition_status}).`,
					);
				}
			}

			// Compute subtotal from the items' line_total (quoted price × qty).
			const subtotal = Math.round(
				items.reduce((s, it) => s + Number(it.line_total || 0), 0) * 100,
			) / 100;

			// Payment-level discount (may be null → falls back to each line's
			// quoted line_discount_amount).
			let discount = null as Discount | null;
			let discount_amount = 0;
			if (data.discount_uuid) {
				discount = (await Discount.query(trx).findOne({
					uuid: data.discount_uuid,
					tenant_uuid: data.tenant_uuid,
				})) as unknown as Discount | undefined ?? null;
				if (!discount) throw new BadRequestException('Discount not found or belongs to a different tenant.');
				if (discount.status !== 'active') throw new BadRequestException('Discount is not active.');
				discount_amount = computeDiscountAmount(
					subtotal,
					discount.discount_type,
					Number(discount.value ?? 0),
					Number(data.discount_open_amount ?? 0),
				);
			}

			// Per-line discount attribution. When a payment-level discount is set,
			// distribute proportionally across items. Otherwise fall back to each
			// row's stored quoted line_discount_amount (so the cashier's on-screen
			// numbers match what got billed).
			const perLineDiscount = new Map<string, number>();
			if (discount) {
				let accum = 0;
				for (let i = 0; i < items.length; i++) {
					const it = items[i];
					const lineTotal = Number(it.line_total || 0);
					let share = 0;
					if (subtotal > 0 && lineTotal > 0) {
						if (i === items.length - 1) share = Math.round((discount_amount - accum) * 100) / 100;
						else share = Math.round((lineTotal / subtotal) * discount_amount * 100) / 100;
					}
					if (share < 0) share = 0;
					if (share > lineTotal) share = lineTotal;
					perLineDiscount.set(it.uuid, share);
					accum += share;
				}
			} else {
				for (const it of items) {
					perLineDiscount.set(it.uuid, Number(it.line_discount_amount || 0));
				}
				discount_amount = Math.round(
					items.reduce((s, it) => s + Number(it.line_discount_amount || 0), 0) * 100,
				) / 100;
			}

			const total = Math.max(0, Math.round((subtotal - discount_amount) * 100) / 100);

			// Cash-specific fields
			const isCash = data.payment_method === 'cash';
			const tendered = isCash && data.amount_tendered != null ? Number(data.amount_tendered) : null;
			const change = isCash && tendered != null ? Math.max(0, Math.round((tendered - total) * 100) / 100) : null;

			// Method-specific field validation. The DTO already type-checks the
			// individual fields; this enforces the cross-field rules.
			const isChanneled = (CHANNELED_PAYMENT_METHODS as readonly string[]).includes(data.payment_method);
			const isArrangement = (ARRANGEMENT_PAYMENT_METHODS as readonly string[]).includes(data.payment_method);
			if (isChanneled && !data.channel?.trim()) {
				throw new BadRequestException(
					data.payment_method === 'ewallet'
						? 'eWallet provider is required.'
						: 'Bank name is required.',
				);
			}
			if (data.payment_method === 'accounts_receivable' && !data.billed_to?.trim()) {
				throw new BadRequestException('A/R needs a Billed To (company or guarantor name).');
			}

			// Only stash proof-of-payment / arrangement fields on methods that
			// actually use them — keeps stray junk out of e.g. cash rows.
			const channel = (isChanneled ? data.channel?.trim() : null) || null;
			const reference = (isChanneled || isArrangement) ? (data.reference?.trim() || null) : null;
			const billed_to = isArrangement ? (data.billed_to?.trim() || null) : null;

			// Charity is treated as auto-resolved on create — no cash will ever
			// be collected, so nothing to follow up on.
			const nowIso = new Date();
			const isSelfResolving = (SELF_RESOLVING_ARRANGEMENTS as readonly string[]).includes(data.payment_method);
			const arrangement_resolved_at = isSelfResolving ? nowIso : null;
			const resolved_by = isSelfResolving ? data.created_by : null;

			const payment_number = await this.nextPaymentNumber(trx, data.tenant_uuid);

			const payment = (await Payment.query(trx).insertAndFetch({
				// Offline sync dispatcher passes the client_uuid as the intended
				// row PK; omit when absent so the DB default (uuid_generate_v4)
				// fires for online creates.
				...((data as any).uuid ? { uuid: (data as any).uuid } : {}),
				tenant_uuid: data.tenant_uuid,
				patient_case_uuid: data.patient_case_uuid,
				patient_uuid: kase.patient_uuid,
				payment_number,
				payment_date: nowIso,
				subtotal,
				total,
				discount_uuid: discount?.uuid ?? null,
				discount_code: discount?.code ?? null,
				discount_name: discount?.name ?? null,
				discount_type: discount?.discount_type ?? null,
				discount_value: discount ? Number(discount.value ?? 0) : null,
				discount_amount,
				payment_method: data.payment_method,
				amount_tendered: tendered,
				change_amount: change,
				channel,
				reference,
				billed_to,
				arrangement_resolved_at,
				resolved_by,
				notes: data.notes ?? null,
				status: 'completed',
				created_by: data.created_by,
				client_uuid: (data as any).client_uuid ?? null,
				created_offline_at: (data as any).created_offline_at ?? null,
			} as any)) as unknown as Payment;

			// Insert payment_items with per-line snapshots and mark the source
			// requisition items as paid.
			for (let i = 0; i < items.length; i++) {
				const it = items[i];
				const lineTotal = Number(it.line_total || 0);
				const lineDisc = perLineDiscount.get(it.uuid) ?? 0;
				const selling = Math.max(0, Math.round((lineTotal - lineDisc) * 100) / 100);

				await PaymentItem.query(trx).insert({
					tenant_uuid: data.tenant_uuid,
					payment_uuid: payment.uuid,
					patient_requisition_uuid: it.patient_requisition_uuid,
					patient_requisition_item_uuid: it.uuid,
					code: it.code,
					name: it.name,
					unit_price: Number(it.unit_price || 0),
					quantity: Number(it.quantity || 0),
					line_total: lineTotal,
					line_discount_amount: lineDisc,
					line_selling_price: selling,
					package_uuid: it.package_uuid ?? null,
					package_code: it.package_code ?? null,
					package_name: it.package_name ?? null,
					display_order: i,
					created_by: data.created_by,
				} as any);

				await PatientRequisitionItem.query(trx).patchAndFetchById(it.uuid, {
					payment_uuid: payment.uuid,
					paid_at: new Date(),
					updated_by: data.created_by,
				} as any);
			}

			// Recompute status on every affected requisition.
			const affectedReqUuids = Array.from(new Set(items.map((it) => it.patient_requisition_uuid)));
			for (const rid of affectedReqUuids) {
				await recomputeRequisitionStatus(trx, rid, data.created_by);
			}

			return payment.uuid;
		});

		// Post-commit re-fetch so the outer connection sees the freshly-inserted
		// payment with its joined case + patient identifiers and items array.
		return (await this.findByUuid(paymentUuid)) as PaymentWithContext;
	}

	/**
	 * Mark an arrangement payment (A/R, insurance, paid outside, other) as
	 * actually settled. Records the real method that came in so the audit
	 * trail shows how the money was received. Cash / ewallet / bank_transfer
	 * rows can't be resolved (they're already collected). Charity self-resolves
	 * on create. Voided rows can't be resolved.
	 */
	async resolveArrangement(
		payment: Payment,
		data: ResolveArrangementDTO,
		resolved_by: string,
	): Promise<PaymentWithContext> {
		if (!(ARRANGEMENT_PAYMENT_METHODS as readonly string[]).includes(payment.payment_method)) {
			throw new BadRequestException(
				`Payment method '${payment.payment_method}' is not an arrangement — nothing to resolve.`,
			);
		}
		if ((SELF_RESOLVING_ARRANGEMENTS as readonly string[]).includes(payment.payment_method)) {
			throw new BadRequestException(
				`Payment method '${payment.payment_method}' is self-resolving.`,
			);
		}
		if (payment.status === 'voided') {
			throw new BadRequestException('Cannot resolve a voided payment.');
		}
		if (payment.arrangement_resolved_at) {
			throw new BadRequestException('Arrangement is already resolved.');
		}
		if (!(RESOLUTION_METHODS as readonly string[]).includes(data.resolved_method)) {
			throw new BadRequestException(
				`resolved_method must be one of ${RESOLUTION_METHODS.join(', ')}.`,
			);
		}
		const needsChannel = (CHANNELED_PAYMENT_METHODS as readonly string[]).includes(data.resolved_method);
		if (needsChannel && !data.resolved_channel?.trim()) {
			throw new BadRequestException(
				data.resolved_method === 'ewallet'
					? 'eWallet provider is required.'
					: 'Bank name is required.',
			);
		}

		await Payment.query().patchAndFetchById(payment.uuid, {
			arrangement_resolved_at: new Date(),
			resolved_method: data.resolved_method,
			resolved_channel: needsChannel ? (data.resolved_channel?.trim() || null) : null,
			resolved_reference: data.resolved_reference?.trim() || null,
			resolved_notes: data.resolved_notes?.trim() || null,
			resolved_by,
			updated_by: resolved_by,
		} as any);

		return (await this.findByUuid(payment.uuid)) as PaymentWithContext;
	}

	/**
	 * Voiding a payment marks the payment status='voided', frees each of its
	 * items (payment_uuid → NULL, paid_at → NULL), and recomputes requisition
	 * statuses so unpaid items surface again in the cashier lookup.
	 */
	async voidPayment(payment: Payment, updated_by: string): Promise<PaymentWithContext> {
		if (payment.status === 'voided') return (await this.findByUuid(payment.uuid)) as PaymentWithContext;
		const knex = Payment.knex();
		await objectionTransaction(knex, async (trx) => {
			const items = (await PaymentItem.query(trx)
				.where({ payment_uuid: payment.uuid })) as unknown as PaymentItem[];

			for (const it of items) {
				await PatientRequisitionItem.query(trx).patchAndFetchById(
					it.patient_requisition_item_uuid,
					{ payment_uuid: null, paid_at: null, updated_by } as any,
				);
			}

			await Payment.query(trx).patchAndFetchById(payment.uuid, {
				status: 'voided',
				updated_by,
			} as any);

			const affectedReqUuids = Array.from(new Set(items.map((it) => it.patient_requisition_uuid)));
			for (const rid of affectedReqUuids) {
				await recomputeRequisitionStatus(trx, rid, updated_by);
			}
		});

		// Post-commit re-fetch — same reason as createPayment.
		return (await this.findByUuid(payment.uuid)) as PaymentWithContext;
	}
}

/**
 * Apply a discount snapshot to a subtotal — mirrors the requisition service's
 * helper so payment-level discounts behave the same as requisition ones.
 */
function computeDiscountAmount(
	subtotal: number,
	discountType: string | null,
	discountValue: number | null,
	openAmountFallback: number,
): number {
	if (!discountType || subtotal <= 0) return 0;
	let raw = 0;
	if (discountType === 'percent') raw = subtotal * Number(discountValue ?? 0) / 100;
	else if (discountType === 'fix') raw = Number(discountValue ?? 0);
	else if (discountType === 'open_amount') raw = Number(openAmountFallback ?? 0);
	if (raw < 0) raw = 0;
	if (raw > subtotal) raw = subtotal;
	return Math.round(raw * 100) / 100;
}

/**
 * Look at a requisition's items and set its status accordingly.
 *   all paid  → 'paid'
 *   some paid → 'partially_paid'
 *   none paid → leave alone (still 'finalized' or whatever it was)
 * Never touches 'cancelled' or 'draft'.
 */
async function recomputeRequisitionStatus(trx: any, requisitionUuid: string, updated_by: string) {
	const req = (await PatientRequisition.query(trx).findOne({ uuid: requisitionUuid })) as
		| PatientRequisition
		| undefined;
	if (!req) return;
	if (['cancelled', 'draft'].includes(String(req.status))) return;

	const items = (await PatientRequisitionItem.query(trx).where({
		patient_requisition_uuid: requisitionUuid,
	})) as unknown as PatientRequisitionItem[];
	if (!items.length) return;

	const paidCount = items.filter((it) => !!(it as any).payment_uuid).length;
	let nextStatus: string;
	if (paidCount === 0) nextStatus = 'finalized';
	else if (paidCount === items.length) nextStatus = 'paid';
	else nextStatus = 'partially_paid';

	if (nextStatus !== req.status) {
		await PatientRequisition.query(trx).patchAndFetchById(requisitionUuid, {
			status: nextStatus,
			updated_by,
		} as any);
	}
}
