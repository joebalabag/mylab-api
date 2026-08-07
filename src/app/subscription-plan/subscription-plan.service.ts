import { Injectable } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { transaction as objectionTransaction } from 'objection';
import { PlanModuleKey, SubscriptionPlan } from './subscription-plan.model';
import {
	SubscriptionPlanPriceLog,
	SubscriptionPlanPriceLogSource,
} from './subscription-plan-price-log.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { SubscriptionPlanDashboardQueryDTO } from './dto/subscription-plan.dto';

// Two decimal-string prices from Postgres can round-trip identically ("0" vs
// "0.0000") — compare as numbers so a no-op save doesn't spam the log.
function pricesDiffer(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
	return Number(a ?? 0) !== Number(b ?? 0);
}

@Injectable()
export class SubscriptionPlanService {
	async listDashboard(filters: SubscriptionPlanDashboardQueryDTO): Promise<PagedResult<SubscriptionPlan>> {
		const query = SubscriptionPlan.query().orderBy('created_at', 'desc');

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('created_at', '<=', `${filters.date_to} 23:59:59`);
		if (filters.status && filters.status.length) query.whereIn('status', filters.status);

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('code', 'ilike', kw)
					.orWhere('name', 'ilike', kw)
					.orWhere('features', 'ilike', kw)
					.orWhere('account_number', 'ilike', kw)
					.orWhere('account_name', 'ilike', kw)
					.orWhere('account_type', 'ilike', kw);
			});
		}

		return applyPagination<SubscriptionPlan>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<SubscriptionPlan | undefined> {
		return SubscriptionPlan.query().findOne({ uuid }) as unknown as SubscriptionPlan | undefined;
	}

	async codeTaken(code: string, excludeUuid?: string): Promise<boolean> {
		const q = SubscriptionPlan.query().where({ code });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		code: string;
		name: string;
		price: number;
		days_duration: number;
		features?: string;
		qrcode_for_payment?: string;
		account_number?: string;
		account_name?: string;
		account_type?: string;
		days_warning_for_near_expiry?: number;
		allowed_modules?: PlanModuleKey[];
		max_terminals?: number | null;
		is_trial?: boolean;
		created_by: string;
	}): Promise<SubscriptionPlan> {
		return objectionTransaction(SubscriptionPlan.knex(), async (trx) => {
			const inserted = (await SubscriptionPlan.query(trx).insertAndFetch({
				code: data.code,
				name: data.name,
				price: data.price,
				days_duration: data.days_duration,
				features: data.features,
				qrcode_for_payment: data.qrcode_for_payment,
				account_number: data.account_number,
				account_name: data.account_name,
				account_type: data.account_type,
				days_warning_for_near_expiry: data.days_warning_for_near_expiry ?? 7,
				allowed_modules: data.allowed_modules ?? [],
				max_terminals: data.max_terminals ?? null,
				is_trial: data.is_trial ?? false,
				status: 'active',
				created_by: data.created_by,
			} as any)) as unknown as SubscriptionPlan;

			// Seed the audit trail with the initial price so subsequent edits
			// have a baseline to diff against. old_price NULL flags the
			// starting state.
			await SubscriptionPlanPriceLog.query(trx).insert({
				subscription_plan_uuid: inserted.uuid,
				old_price: null,
				new_price: Number(inserted.price ?? 0),
				source: 'create' as SubscriptionPlanPriceLogSource,
				changed_by: data.created_by,
			} as any);

			return inserted;
		});
	}

	/**
	 * Active + is_trial plans exposed to the public register page. Returns only
	 * the fields the picker needs — omits QR / payee details.
	 */
	async listPublicTrials(): Promise<Array<Pick<SubscriptionPlan,
		'uuid' | 'code' | 'name' | 'price' | 'days_duration' | 'features' | 'allowed_modules' | 'max_terminals'
	>>> {
		return SubscriptionPlan.query()
			.where({ is_trial: true, status: 'active' })
			.select('uuid', 'code', 'name', 'price', 'days_duration', 'features', 'allowed_modules', 'max_terminals')
			.orderBy('price', 'asc') as any;
	}

	/**
	 * All active plans (trial + paid) exposed to the public marketing landing
	 * page. Same trimmed field set as listPublicTrials, plus is_trial so the
	 * landing UI can badge free plans. QR / payee / status fields are omitted
	 * because they aren't needed for pricing display and reveal payment infra.
	 */
	async listPublicPlans(): Promise<Array<Pick<SubscriptionPlan,
		'uuid' | 'code' | 'name' | 'price' | 'days_duration' | 'features' | 'allowed_modules' | 'max_terminals' | 'is_trial'
	>>> {
		return SubscriptionPlan.query()
			.where({ status: 'active' })
			.select('uuid', 'code', 'name', 'price', 'days_duration', 'features', 'allowed_modules', 'max_terminals', 'is_trial')
			.orderBy('price', 'asc') as any;
	}

	async update(
		uuid: string,
		data: Partial<SubscriptionPlan> & { updated_by: string }
	): Promise<SubscriptionPlan | undefined> {
		return objectionTransaction(SubscriptionPlan.knex(), async (trx) => {
			const existing = (await SubscriptionPlan.query(trx).findById(uuid)) as unknown as
				| SubscriptionPlan
				| undefined;
			const updated = (await SubscriptionPlan.query(trx).patchAndFetchById(uuid, data as any)) as unknown as
				| SubscriptionPlan
				| undefined;

			// Only append to history when the numeric price actually moved —
			// name / features / QR edits shouldn't create a phantom price row.
			if (existing && updated && pricesDiffer(existing.price, updated.price)) {
				await SubscriptionPlanPriceLog.query(trx).insert({
					subscription_plan_uuid: uuid,
					old_price: Number(existing.price ?? 0),
					new_price: Number(updated.price ?? 0),
					source: 'edit' as SubscriptionPlanPriceLogSource,
					changed_by: data.updated_by,
				} as any);
			}

			return updated;
		});
	}

	/**
	 * Newest-first history of price changes for a plan. Bounded to guard
	 * against a runaway plan that's been edited thousands of times.
	 */
	async listPriceHistory(
		uuid: string,
		opts: { limit?: number } = {},
	): Promise<SubscriptionPlanPriceLog[]> {
		return (await SubscriptionPlanPriceLog.query()
			.where({ subscription_plan_uuid: uuid })
			.orderBy('changed_at', 'desc')
			.limit(Math.min(Math.max(Number(opts.limit) || 100, 1), 500))) as unknown as SubscriptionPlanPriceLog[];
	}

	async delete(uuid: string): Promise<{ count: number; removedQrcode?: string }> {
		const existing = await this.findByUuid(uuid);
		const count = await SubscriptionPlan.query().delete().where({ uuid });
		let removedQrcode: string | undefined;
		if (existing?.qrcode_for_payment) {
			this.removeQrcodeFile(existing.qrcode_for_payment);
			removedQrcode = existing.qrcode_for_payment;
		}
		return { count, removedQrcode };
	}

	async setStatus(
		uuid: string,
		status: 'active' | 'inactive',
		updated_by: string
	): Promise<SubscriptionPlan | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}

	removeQrcodeFile(publicPathOrUrl: string): void {
		try {
			const stripped = publicPathOrUrl.replace(/^\/?public\//, '');
			if (!stripped || stripped.includes('..')) return;
			const abs = join(process.cwd(), 'public', stripped);
			if (existsSync(abs)) unlinkSync(abs);
		} catch {
			/* ignore */
		}
	}
}
