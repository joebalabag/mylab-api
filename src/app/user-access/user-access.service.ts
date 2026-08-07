import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';

import { AccessTemplate } from '../access-template/access-template.model';
import { User } from '../user/user.model';
import { UserAccess } from './user-access.model';
import { SaveUserAccessDTO, UserAccessListQueryDTO } from './dto/user-access.dto';

export interface UserAccessMatrixRow {
	access_template_uuid: string;
	navigation_id: number;
	catalog_id: number;
	catalog: string;
	main_navigation: string;
	sub_navigation: string;
	remarks: string | null;
	user_access_uuid: string | null;
	has_access: boolean;
	is_assigned: boolean;
}

@Injectable()
export class UserAccessService {
	/**
	 * Merged view: every access_templates row combined with the user's
	 * user_accesses override (if any). Template rows the user has not been
	 * assigned yet appear with has_access=false and is_assigned=false so new
	 * template additions surface automatically.
	 */
	async listForUser(
		user_uuid: string,
		filters: UserAccessListQueryDTO,
	): Promise<UserAccessMatrixRow[]> {
		const templates = (await AccessTemplate.query().orderBy('navigation_id', 'asc')) as unknown as AccessTemplate[];
		const userRows = (await UserAccess.query().where({ user_uuid })) as unknown as UserAccess[];

		const byNavId = new Map<number, UserAccess>();
		for (const r of userRows) byNavId.set(r.navigation_id, r);

		const merged: UserAccessMatrixRow[] = templates.map((t) => {
			const ua = byNavId.get(t.navigation_id);
			return {
				access_template_uuid: t.uuid,
				navigation_id: t.navigation_id,
				catalog_id: t.catalog_id,
				catalog: t.catalog,
				main_navigation: t.main_navigation,
				sub_navigation: t.sub_navigation,
				remarks: t.remarks ?? null,
				user_access_uuid: ua?.uuid ?? null,
				has_access: ua?.has_access ?? false,
				is_assigned: !!ua,
			};
		});

		if (filters.only_granted === true) return merged.filter((r) => r.has_access);
		return merged;
	}

	async getUser(user_uuid: string): Promise<User | undefined> {
		return User.query().findOne({ uuid: user_uuid }) as unknown as User | undefined;
	}

	/**
	 * Atomic bulk save: delete all existing user_access rows for this user,
	 * then insert one row per payload item — snapshotting catalog / main /
	 * sub / remarks from the matching access_templates row (by navigation_id).
	 */
	async saveForUser(
		user_uuid: string,
		payload: SaveUserAccessDTO,
		saved_by: string,
	): Promise<UserAccess[]> {
		if (!payload.items?.length) throw new BadRequestException('items is required.');

		// Guard: no duplicate navigation_id in the payload.
		const seen = new Set<number>();
		for (const item of payload.items) {
			if (seen.has(item.navigation_id)) {
				throw new BadRequestException(`Duplicate navigation_id ${item.navigation_id} in payload.`);
			}
			seen.add(item.navigation_id);
		}

		return objectionTransaction(UserAccess.knex(), async (trx) => {
			const user = (await User.query(trx).findOne({ uuid: user_uuid })) as User | undefined;
			if (!user) throw new NotFoundException('User not found.');

			const navIds = payload.items.map((i) => i.navigation_id);
			const templates = (await AccessTemplate.query(trx).whereIn('navigation_id', navIds)) as unknown as AccessTemplate[];
			const byNav = new Map<number, AccessTemplate>();
			for (const t of templates) byNav.set(t.navigation_id, t);

			const missing = navIds.filter((n) => !byNav.has(n));
			if (missing.length) {
				throw new BadRequestException(
					`Unknown navigation_id(s): ${missing.join(', ')}. Add the row to access_templates first.`,
				);
			}

			await UserAccess.query(trx).delete().where({ user_uuid });

			const rows = payload.items.map((item) => {
				const tpl = byNav.get(item.navigation_id) as AccessTemplate;
				return {
					tenant_uuid: user.tenant_uuid,
					user_uuid,
					navigation_id: tpl.navigation_id,
					catalog_id: tpl.catalog_id,
					catalog: tpl.catalog,
					main_navigation: tpl.main_navigation,
					sub_navigation: tpl.sub_navigation,
					remarks: tpl.remarks ?? null,
					has_access: !!item.has_access,
					created_by: saved_by,
				};
			});

			await UserAccess.query(trx).insert(rows as any);

			return UserAccess.query(trx)
				.where({ user_uuid })
				.orderBy('navigation_id', 'asc') as unknown as Promise<UserAccess[]>;
		});
	}
}
