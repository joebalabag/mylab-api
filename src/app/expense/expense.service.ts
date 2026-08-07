import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';

import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { User } from '../user/user.model';
import { Expense, ExpenseStatus } from './expense.model';
import {
	CreateExpenseDTO,
	ExpenseDashboardQueryDTO,
	UpdateExpenseDTO,
	VoidExpenseDTO,
} from './dto/expense.dto';

interface CashierCtx {
	uuid: string | null;
	name: string;
	username: string;
}

@Injectable()
export class ExpenseService {
	private round(n: number): number {
		return Math.round(n * 10000) / 10000;
	}

	// ── query ────────────────────────────────────────────────────────

	async listDashboard(filters: ExpenseDashboardQueryDTO): Promise<PagedResult<Expense>> {
		const q = Expense.query().orderBy('date_transact', 'desc').orderBy('created_at', 'desc');

		if (filters.tenant_uuid) q.where('tenant_uuid', filters.tenant_uuid);
		if (filters.user_uuid) q.where('user_uuid', filters.user_uuid);
		if (filters.category) q.where('category', 'ilike', filters.category);

		if (filters.date_transact_from) q.where('date_transact', '>=', filters.date_transact_from);
		if (filters.date_transact_to) q.where('date_transact', '<=', filters.date_transact_to);

		if (filters.date_from) q.where('created_at', '>=', filters.date_from);
		if (filters.date_to) q.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) q.whereIn('status', filters.status);

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			q.where((qb) => {
				qb.where('category', 'ilike', kw)
					.orWhere('description', 'ilike', kw)
					.orWhere('notes', 'ilike', kw)
					.orWhere('cashier_name', 'ilike', kw)
					.orWhere('cashier_username', 'ilike', kw)
					.orWhere('void_reason', 'ilike', kw);
			});
		}

		return applyPagination<Expense>(q as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<Expense | undefined> {
		return Expense.query().findOne({ uuid }) as unknown as Expense | undefined;
	}

	// ── mutations ────────────────────────────────────────────────────

	async create(payload: {
		tenant_uuid: string;
		cashier: CashierCtx;
		dto: CreateExpenseDTO;
		created_by: string;
	}): Promise<Expense> {
		return objectionTransaction(Expense.knex(), async (trx) => {
			const dto = payload.dto;

			// Owner snapshot. Admin can log on behalf via dto.user_uuid; otherwise
			// we snapshot from the caller's token context.
			let user_uuid: string | null = payload.cashier.uuid;
			let cashier_name: string | null = payload.cashier.name;
			let cashier_username: string | null = payload.cashier.username;
			if (dto.user_uuid) {
				const u = (await User.query(trx).findOne({
					uuid: dto.user_uuid,
					tenant_uuid: payload.tenant_uuid,
				})) as User | undefined;
				if (!u) throw new BadRequestException('User not found for this tenant.');
				user_uuid = u.uuid;
				cashier_name = u.name;
				cashier_username = u.username;
			}

			return (await Expense.query(trx).insertAndFetch({
				tenant_uuid: payload.tenant_uuid,
				user_uuid,
				cashier_name,
				cashier_username,
				date_transact: dto.date_transact,
				category: dto.category,
				description: dto.description,
				amount: this.round(Number(dto.amount) || 0),
				notes: dto.notes ?? null,
				status: 'active',
				created_by: payload.created_by,
			} as any)) as unknown as Expense;
		});
	}

	async update(
		uuid: string,
		expected_tenant_uuid: string,
		dto: UpdateExpenseDTO,
		updated_by: string
	): Promise<Expense> {
		const row = await this.findByUuid(uuid);
		if (!row) throw new NotFoundException('Expense not found.');
		if (row.tenant_uuid !== expected_tenant_uuid)
			throw new BadRequestException('Expense belongs to a different tenant.');
		if (row.status !== 'active')
			throw new ConflictException(`Cannot update a ${row.status} expense.`);

		const patch: any = { updated_by };
		if (dto.date_transact !== undefined) patch.date_transact = dto.date_transact;
		if (dto.category !== undefined) patch.category = dto.category;
		if (dto.description !== undefined) patch.description = dto.description;
		if (dto.amount !== undefined) patch.amount = this.round(Number(dto.amount) || 0);
		if (dto.notes !== undefined) patch.notes = dto.notes;

		return (await Expense.query().patchAndFetchById(uuid, patch)) as unknown as Expense;
	}

	async setStatus(uuid: string, status: ExpenseStatus, updated_by: string): Promise<Expense> {
		return (await Expense.query().patchAndFetchById(uuid, { status, updated_by } as any)) as unknown as
			Expense;
	}

	async void(
		uuid: string,
		expected_tenant_uuid: string,
		dto: VoidExpenseDTO,
		voider: CashierCtx
	): Promise<Expense> {
		const row = await this.findByUuid(uuid);
		if (!row) throw new NotFoundException('Expense not found.');
		if (row.tenant_uuid !== expected_tenant_uuid)
			throw new BadRequestException('Expense belongs to a different tenant.');
		if (row.status === 'void')
			throw new ConflictException('Expense is already voided.');

		return (await Expense.query().patchAndFetchById(uuid, {
			status: 'void',
			voided_at: new Date(),
			voided_by_uuid: voider.uuid,
			voided_by_name: voider.name,
			void_reason: dto.reason ?? null,
			updated_by: voider.name,
		} as any)) as unknown as Expense;
	}

	async delete(uuid: string): Promise<number> {
		return Expense.query().delete().where({ uuid });
	}
}
