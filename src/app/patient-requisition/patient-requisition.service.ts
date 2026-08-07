import { BadRequestException, Injectable } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { Tenant } from '../tenant/tenant.model';
import { PatientCase } from '../patient-case/patient-case.model';
import { TestItem } from '../test-item/test-item.model';
import { ItemPackage } from '../item-package/item-package.model';
import { Discount } from '../discount/discount.model';
import { PatientRequisition, RequisitionStatus } from './patient-requisition.model';
import {
	PatientRequisitionItem,
	RequisitionSourceType,
} from './patient-requisition-item.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import {
	PatientRequisitionDashboardQueryDTO,
	PatientRequisitionItemRowDTO,
} from './dto/patient-requisition.dto';

export interface PatientRequisitionWithMeta extends PatientRequisition {
	patient_case_number?: string | null;
	patient_case_type?: string | null;
	patient_number?: string | null;
	patient_first_name?: string | null;
	patient_last_name?: string | null;
	item_count?: number;
	items?: PatientRequisitionItem[];
}

@Injectable()
export class PatientRequisitionService {
	async listDashboard(
		filters: PatientRequisitionDashboardQueryDTO,
	): Promise<PagedResult<PatientRequisitionWithMeta>> {
		const query = PatientRequisition.query()
			.alias('pr')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'pr.patient_case_uuid')
			.leftJoin('patients as p', 'p.uuid', 'pr.patient_uuid')
			.select(
				'pr.*',
				'pc.case_number as patient_case_number',
				'pc.case_type as patient_case_type',
				'p.patient_number as patient_number',
				'p.first_name as patient_first_name',
				'p.last_name as patient_last_name',
				PatientRequisition.knex().raw(
					'(SELECT COUNT(*) FROM patient_requisition_items pri WHERE pri.patient_requisition_uuid = pr.uuid) AS item_count',
				),
			)
			.orderBy('pr.requisition_date', 'desc');

		if (filters.tenant_uuid) query.where('pr.tenant_uuid', filters.tenant_uuid);
		if (filters.patient_case_uuid) query.where('pr.patient_case_uuid', filters.patient_case_uuid);
		if (filters.patient_uuid) query.where('pr.patient_uuid', filters.patient_uuid);

		if (filters.date_from) query.where('pr.requisition_date', '>=', filters.date_from);
		if (filters.date_to) query.where('pr.requisition_date', '<=', `${filters.date_to} 23:59:59`);
		if (filters.status && filters.status.length) query.whereIn('pr.status', filters.status);

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('pr.requisition_number', 'ilike', kw)
					.orWhere('pc.case_number', 'ilike', kw)
					.orWhere('p.patient_number', 'ilike', kw)
					.orWhere('p.first_name', 'ilike', kw)
					.orWhere('p.last_name', 'ilike', kw);
			});
		}

		return applyPagination<PatientRequisitionWithMeta>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<PatientRequisitionWithMeta | undefined> {
		const parent = (await PatientRequisition.query()
			.alias('pr')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'pr.patient_case_uuid')
			.leftJoin('patients as p', 'p.uuid', 'pr.patient_uuid')
			.select(
				'pr.*',
				'pc.case_number as patient_case_number',
				'pc.case_type as patient_case_type',
				'p.patient_number as patient_number',
				'p.first_name as patient_first_name',
				'p.last_name as patient_last_name',
			)
			.findOne({ 'pr.uuid': uuid })) as unknown as PatientRequisitionWithMeta | undefined;
		if (!parent) return undefined;

		const items = (await PatientRequisitionItem.query()
			.where({ patient_requisition_uuid: uuid })
			.orderBy([
				{ column: 'display_order', order: 'asc' },
				{ column: 'created_at', order: 'asc' },
			])) as unknown as PatientRequisitionItem[];

		return { ...(parent as any), items } as PatientRequisitionWithMeta;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	/** Confirms the case belongs to the tenant; returns it with its patient_uuid. */
	async findCaseInTenant(patient_case_uuid: string, tenant_uuid: string): Promise<PatientCase | undefined> {
		return PatientCase.query().findOne({
			uuid: patient_case_uuid,
			tenant_uuid,
		}) as unknown as PatientCase | undefined;
	}

	/**
	 * Race-safe per-tenant requisition_number. Format: "R-NNNNNN".
	 * Uses the same advisory-lock pattern as patient MRN / case numbers.
	 */
	async create(data: {
		tenant_uuid: string;
		patient_case_uuid: string;
		patient_uuid: string;
		requisition_date?: string | Date;
		notes?: string | null;
		created_by: string;
	}): Promise<PatientRequisition> {
		const knex = PatientRequisition.knex();
		return objectionTransaction(knex, async (trx) => {
			await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
				`requisition-number:${data.tenant_uuid}`,
			]);

			const maxRow = (await PatientRequisition.query(trx)
				.where({ tenant_uuid: data.tenant_uuid })
				.max('requisition_number as max_num')
				.first()) as { max_num?: string } | undefined;

			let next = 1;
			if (maxRow?.max_num) {
				const match = String(maxRow.max_num).match(/(\d+)$/);
				if (match) next = parseInt(match[1], 10) + 1;
			}
			const requisition_number = `R-${String(next).padStart(6, '0')}`;

			const inserted = (await PatientRequisition.query(trx).insertAndFetch({
				tenant_uuid: data.tenant_uuid,
				patient_case_uuid: data.patient_case_uuid,
				patient_uuid: data.patient_uuid,
				requisition_number,
				requisition_date: (data.requisition_date as any) ?? new Date(),
				notes: data.notes ?? null,
				subtotal: 0,
				total: 0,
				status: 'draft',
				created_by: data.created_by,
			} as any)) as unknown as PatientRequisition;
			return inserted;
		});
	}

	async update(
		uuid: string,
		data: Partial<PatientRequisition> & { updated_by: string },
	): Promise<PatientRequisition | undefined> {
		// Cached totals + requisition_number are server-owned.
		const { subtotal: _s, total: _t, requisition_number: _rn, ...rest } = data as any;
		return PatientRequisition.query().patchAndFetchById(uuid, rest as any) as unknown as
			| PatientRequisition
			| undefined;
	}

	async delete(uuid: string): Promise<number> {
		return PatientRequisition.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: RequisitionStatus, updated_by: string) {
		return this.update(uuid, { status, updated_by } as any);
	}

	/**
	 * Whole-list sync of a requisition's items. In one transaction:
	 *   1. Resolve each row's source (test_item or item_package) against the
	 *      tenant; snapshot code/name/unit_price when missing.
	 *   2. Upsert / insert / delete against the current rows.
	 *   3. Recompute cached subtotal + total = SUM(line_total).
	 */
	async syncItems(
		requisition: PatientRequisition,
		rows: PatientRequisitionItemRowDTO[],
		updated_by: string,
	): Promise<{ items: PatientRequisitionItem[]; subtotal: number; total: number }> {
		const knex = PatientRequisitionItem.knex();
		return objectionTransaction(knex, async (trx) => {
			// Preload the referenced catalog rows in one shot to validate
			// tenancy and pull snapshotable code/name/price.
			const testItemUuids = Array.from(
				new Set(rows.filter((r) => r.source_type === 'test_item').map((r) => r.source_uuid)),
			);
			const packageUuids = Array.from(
				new Set(rows.filter((r) => r.source_type === 'item_package').map((r) => r.source_uuid)),
			);

			const testItems = testItemUuids.length
				? ((await TestItem.query(trx).whereIn('uuid', testItemUuids)) as unknown as TestItem[])
				: [];
			const packages = packageUuids.length
				? ((await ItemPackage.query(trx).whereIn('uuid', packageUuids)) as unknown as ItemPackage[])
				: [];
			const tiByUuid = new Map(testItems.map((t) => [t.uuid, t]));
			const pkgByUuid = new Map(packages.map((p) => [p.uuid, p]));

			for (const r of rows) {
				if (r.source_type === 'test_item') {
					const ti = tiByUuid.get(r.source_uuid);
					if (!ti) throw new BadRequestException(`Test item ${r.source_uuid} not found.`);
					if (ti.tenant_uuid !== requisition.tenant_uuid) {
						throw new BadRequestException('Test item belongs to a different tenant.');
					}
				} else {
					const pkg = pkgByUuid.get(r.source_uuid);
					if (!pkg) throw new BadRequestException(`Item package ${r.source_uuid} not found.`);
					if (pkg.tenant_uuid !== requisition.tenant_uuid) {
						throw new BadRequestException('Item package belongs to a different tenant.');
					}
				}
			}

			const existing = (await PatientRequisitionItem.query(trx).where({
				patient_requisition_uuid: requisition.uuid,
			})) as unknown as PatientRequisitionItem[];
			const existingByUuid = new Map(existing.map((c) => [c.uuid, c]));

			const seenUuids = new Set<string>();

			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];
				const order = row.display_order ?? i;
				const qty = Math.max(1, Number(row.quantity ?? 1));

				// Snapshot from the source catalog. Callers may override unit_price
				// (rare — special-case pricing) but code/name always snapshot from
				// the source so bills print stable identifiers.
				let code: string;
				let name: string;
				let unit_price: number;
				if (row.source_type === 'test_item') {
					const ti = tiByUuid.get(row.source_uuid)!;
					code = ti.code;
					name = ti.name;
					unit_price = row.unit_price != null ? Number(row.unit_price) : Number(ti.price ?? 0);
				} else {
					const pkg = pkgByUuid.get(row.source_uuid)!;
					code = pkg.code;
					name = pkg.name;
					unit_price = row.unit_price != null ? Number(row.unit_price) : Number(pkg.package_price ?? 0);
				}
				const line_total = Math.round(unit_price * qty * 100) / 100;

				// Package attribution — passed through as-is when the frontend
				// exploded a package into per-test rows. NULL for standalone tests.
				const package_uuid = (row as any).package_uuid ?? null;
				const package_code = (row as any).package_code ?? null;
				const package_name = (row as any).package_name ?? null;

				if (row.uuid) {
					if (!existingByUuid.has(row.uuid)) {
						throw new BadRequestException(`Line ${row.uuid} does not belong to this requisition.`);
					}
					await PatientRequisitionItem.query(trx).patchAndFetchById(row.uuid, {
						source_type: row.source_type,
						source_uuid: row.source_uuid,
						code,
						name,
						unit_price,
						quantity: qty,
						line_total,
						display_order: order,
						package_uuid,
						package_code,
						package_name,
						updated_by,
					} as any);
					seenUuids.add(row.uuid);
				} else {
					const inserted = (await PatientRequisitionItem.query(trx).insertAndFetch({
						tenant_uuid: requisition.tenant_uuid,
						patient_requisition_uuid: requisition.uuid,
						source_type: row.source_type,
						source_uuid: row.source_uuid,
						code,
						name,
						unit_price,
						quantity: qty,
						line_total,
						display_order: order,
						package_uuid,
						package_code,
						package_name,
						created_by: updated_by,
					} as any)) as unknown as PatientRequisitionItem;
					seenUuids.add(inserted.uuid);
				}
			}

			const toDelete = existing.filter((c) => !seenUuids.has(c.uuid)).map((c) => c.uuid);
			if (toDelete.length) {
				await PatientRequisitionItem.query(trx).delete().whereIn('uuid', toDelete);
			}

			const finalItems = (await PatientRequisitionItem.query(trx)
				.where({ patient_requisition_uuid: requisition.uuid })
				.orderBy([
					{ column: 'display_order', order: 'asc' },
					{ column: 'created_at', order: 'asc' },
				])) as unknown as PatientRequisitionItem[];

			const subtotal = Math.round(
				finalItems.reduce((s, it) => s + Number(it.line_total || 0), 0) * 100,
			) / 100;

			// Reapply the current discount snapshot against the new subtotal.
			// For percent/fix we recompute from the stored value. For
			// open_amount the operator's original amount is capped to subtotal
			// so shrinking the cart never leaves discount > total.
			const discount_amount = computeDiscountAmount(
				subtotal,
				requisition.discount_type ?? null,
				requisition.discount_value != null ? Number(requisition.discount_value) : null,
				Number(requisition.discount_amount ?? 0),
			);
			const total = Math.max(0, Math.round((subtotal - discount_amount) * 100) / 100);

			// Distribute the discount across lines and re-fetch the fresh rows
			// so the returned payload carries line_discount_amount + line_selling_price.
			await distributeLineDiscounts(trx, finalItems, subtotal, discount_amount, updated_by);
			const withLineDiscounts = (await PatientRequisitionItem.query(trx)
				.where({ patient_requisition_uuid: requisition.uuid })
				.orderBy([
					{ column: 'display_order', order: 'asc' },
					{ column: 'created_at', order: 'asc' },
				])) as unknown as PatientRequisitionItem[];

			await PatientRequisition.query(trx).patchAndFetchById(requisition.uuid, {
				subtotal,
				discount_amount,
				total,
				updated_by,
			} as any);

			return { items: withLineDiscounts, subtotal, total };
		});
	}

	/**
	 * Set or clear the requisition-level discount. Snapshots the discount
	 * catalog row (code / name / type / value) so later edits to the
	 * discounts table don't rewrite historical bills. Recomputes total.
	 */
	async setDiscount(
		requisition: PatientRequisition,
		payload: { discount_uuid?: string | null; clear?: boolean; discount_open_amount?: number },
		updated_by: string,
	): Promise<PatientRequisition> {
		const knex = PatientRequisition.knex();
		return objectionTransaction(knex, async (trx) => {
			const subtotal = Number(requisition.subtotal ?? 0);

			// Load the current items in the same transaction so both the
			// clear and set paths can distribute per-line discount consistently.
			const currentItems = (await PatientRequisitionItem.query(trx)
				.where({ patient_requisition_uuid: requisition.uuid })
				.orderBy([
					{ column: 'display_order', order: 'asc' },
					{ column: 'created_at', order: 'asc' },
				])) as unknown as PatientRequisitionItem[];

			// Clear path — null uuid or explicit clear flag → zero out per-line
			// discount and reset parent snapshot.
			if (payload.clear || payload.discount_uuid === null || payload.discount_uuid === undefined) {
				const total = Math.max(0, Math.round(subtotal * 100) / 100);
				await distributeLineDiscounts(trx, currentItems, subtotal, 0, updated_by);
				return (await PatientRequisition.query(trx).patchAndFetchById(requisition.uuid, {
					discount_uuid: null,
					discount_code: null,
					discount_name: null,
					discount_type: null,
					discount_value: null,
					discount_amount: 0,
					total,
					updated_by,
				} as any)) as unknown as PatientRequisition;
			}

			const discount = (await Discount.query(trx).findOne({
				uuid: payload.discount_uuid,
				tenant_uuid: requisition.tenant_uuid,
			})) as unknown as Discount | undefined;
			if (!discount) {
				throw new BadRequestException('Discount not found or belongs to a different tenant.');
			}
			if (discount.status !== 'active') {
				throw new BadRequestException('Discount is not active.');
			}

			// For open_amount the operator's typed amount is authoritative;
			// for others the snapshotted value drives the math.
			const seedAmount =
				discount.discount_type === 'open_amount'
					? Number(payload.discount_open_amount ?? 0)
					: 0;
			const discount_amount = computeDiscountAmount(
				subtotal,
				discount.discount_type,
				Number(discount.value ?? 0),
				seedAmount,
			);
			const total = Math.max(0, Math.round((subtotal - discount_amount) * 100) / 100);

			await distributeLineDiscounts(trx, currentItems, subtotal, discount_amount, updated_by);

			return (await PatientRequisition.query(trx).patchAndFetchById(requisition.uuid, {
				discount_uuid: discount.uuid,
				discount_code: discount.code,
				discount_name: discount.name,
				discount_type: discount.discount_type,
				discount_value: Number(discount.value ?? 0),
				discount_amount,
				total,
				updated_by,
			} as any)) as unknown as PatientRequisition;
		});
	}
}

/**
 * Splits the requisition-level discount across its lines by each line's
 * share of subtotal (line_total / subtotal). Last non-zero line absorbs
 * rounding residue so per-line discounts sum EXACTLY to totalDiscount and
 * per-line selling prices sum exactly to (subtotal - totalDiscount).
 *
 * When subtotal is 0 or totalDiscount is 0 every line gets 0 discount and
 * line_selling_price = line_total.
 */
async function distributeLineDiscounts(
	trx: any,
	items: PatientRequisitionItem[],
	subtotal: number,
	totalDiscount: number,
	updated_by: string,
): Promise<void> {
	if (!items.length) return;

	// Build the per-line target discount amount up front so we can fix the
	// rounding residue on the last non-zero line in a single pass.
	const perLine = items.map((it) => {
		const lineTotal = Number(it.line_total || 0);
		if (subtotal <= 0 || totalDiscount <= 0 || lineTotal <= 0) return 0;
		return Math.round((lineTotal / subtotal) * totalDiscount * 100) / 100;
	});

	const summed = Math.round(perLine.reduce((s, v) => s + v, 0) * 100) / 100;
	const targetTotal = Math.round(totalDiscount * 100) / 100;
	const residue = Math.round((targetTotal - summed) * 100) / 100;
	if (residue !== 0) {
		// Give the residue to the last line that already carries a discount so
		// we don't create a discount on a zero-value line (would push its
		// selling price negative).
		for (let i = perLine.length - 1; i >= 0; i--) {
			if (perLine[i] > 0 || residue > 0) {
				perLine[i] = Math.round((perLine[i] + residue) * 100) / 100;
				break;
			}
		}
	}

	// Patch each line individually — small N here (usually < 30), so no batch
	// query gymnastics needed. Cap discount at line_total defensively.
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		const lineTotal = Number(it.line_total || 0);
		let disc = perLine[i];
		if (disc < 0) disc = 0;
		if (disc > lineTotal) disc = lineTotal;
		const selling = Math.round((lineTotal - disc) * 100) / 100;
		await PatientRequisitionItem.query(trx).patchAndFetchById(it.uuid, {
			line_discount_amount: disc,
			line_selling_price: selling,
			updated_by,
		} as any);
	}
}

/**
 * Applies a discount snapshot to a subtotal and returns the peso amount to
 * subtract. Capped at subtotal for every type so total never goes negative.
 *   percent      → subtotal × value / 100
 *   fix          → min(subtotal, value)
 *   open_amount  → min(subtotal, openAmountFallback)  — value column is unused
 *   null / other → 0 (no discount)
 */
function computeDiscountAmount(
	subtotal: number,
	discountType: string | null,
	discountValue: number | null,
	openAmountFallback: number,
): number {
	if (!discountType || subtotal <= 0) return 0;
	let raw = 0;
	if (discountType === 'percent') {
		raw = subtotal * Number(discountValue ?? 0) / 100;
	} else if (discountType === 'fix') {
		raw = Number(discountValue ?? 0);
	} else if (discountType === 'open_amount') {
		raw = Number(openAmountFallback ?? 0);
	}
	if (raw < 0) raw = 0;
	if (raw > subtotal) raw = subtotal;
	return Math.round(raw * 100) / 100;
}
