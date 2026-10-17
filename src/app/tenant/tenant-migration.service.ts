import {
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { transaction as objectionTransaction } from 'objection';

import { Admin } from '../admin/admin.model';
import { Tenant } from './tenant.model';
import { AuthService } from '../auth/auth.service';
import { COPYABLE_CATALOG_TABLES, CopyableCatalogTable } from './dto/tenant-migration.dto';

// Transaction-side tables purged before patient master rows. FK-safe:
// children appear before their parents. Each row is scoped by tenant_uuid.
const TRANSACTION_DELETE_ORDER = [
	'lab_result_values',
	'lab_report_items',
	'lab_reports',
	'payment_items',
	'payments',
	'patient_requisition_items',
	'patient_requisitions',
	'patient_cases',
] as const;

@Injectable()
export class TenantMigrationService {
	constructor(private readonly authService: AuthService) {}

	// Shared pre-flight for every migration action:
	//   1. caller must be an authenticated super_admin,
	//   2. caller re-enters their password (defence against hijacked session),
	//   3. target tenant must exist.
	private async authorise(currentUser: any, password: string, targetTenantUuid: string) {
		if (!currentUser || currentUser.type !== 'admin') {
			throw new ForbiddenException('Admin token required.');
		}
		if (String(currentUser.role || '').toLowerCase() !== 'super_admin') {
			throw new ForbiddenException('Super-admin role required.');
		}
		const me = await Admin.query().findById(currentUser.uuid);
		if (!me) throw new UnauthorizedException('Session user not found.');
		const ok = await this.authService.validatePassword(password, (me as any).passphrase);
		if (!ok) throw new UnauthorizedException('Password does not match.');

		const tenant = await Tenant.query().findById(targetTenantUuid);
		if (!tenant) throw new NotFoundException('Target tenant not found.');
	}

	async deleteTransactions(targetTenantUuid: string, password: string, currentUser: any) {
		await this.authorise(currentUser, password, targetTenantUuid);
		return this.runTransactionsDelete(targetTenantUuid);
	}

	async deletePatientRecords(targetTenantUuid: string, password: string, currentUser: any) {
		await this.authorise(currentUser, password, targetTenantUuid);
		// Patients are FK-restricted by every transaction table; purge those
		// first inside the same transaction so a RESTRICT constraint never
		// leaves orphan patients.
		const txCounts = await this.runTransactionsDelete(targetTenantUuid);
		const knex = Tenant.knex();
		let patientsDeleted = 0;
		await objectionTransaction(knex, async (trx) => {
			patientsDeleted = await trx('patients').where({ tenant_uuid: targetTenantUuid }).delete();
		});
		return { ...txCounts, patients: patientsDeleted };
	}

	async copyCatalog(
		targetTenantUuid: string,
		password: string,
		sourceTenantUuid: string,
		tables: CopyableCatalogTable[],
		currentUser: any,
	) {
		await this.authorise(currentUser, password, targetTenantUuid);
		if (sourceTenantUuid === targetTenantUuid) {
			throw new ConflictException('Source and target tenant must differ.');
		}
		const source = await Tenant.query().findById(sourceTenantUuid);
		if (!source) throw new NotFoundException('Source tenant not found.');

		// De-dupe + preserve the FK-safe order so a user selecting only
		// test_items still ends up with the dependency tables processed
		// in the right order if they're already selected.
		const selected = COPYABLE_CATALOG_TABLES.filter((t) => tables.includes(t));
		if (selected.length === 0) {
			throw new ConflictException('No valid tables selected.');
		}

		const knex = Tenant.knex();

		// 409 preflight: refuse if target already has rows in any selected
		// table. Codes are unique per tenant — a merge-insert would blow up
		// on duplicate codes, and we don't want partial state.
		const targetCountsBefore: Record<string, number> = {};
		for (const table of selected) {
			const [{ count }] = await knex(table).where({ tenant_uuid: targetTenantUuid }).count();
			targetCountsBefore[table] = Number(count);
		}
		const nonEmpty = Object.entries(targetCountsBefore).filter(([, n]) => n > 0);
		if (nonEmpty.length) {
			const summary = nonEmpty.map(([t, n]) => `${t}=${n}`).join(', ');
			throw new ConflictException(
				`Target tenant already has rows in: ${summary}. Purge those tables on the target first.`,
			);
		}

		const inserted: Record<string, number> = {};
		await objectionTransaction(knex, async (trx) => {
			const rows: Record<string, any[]> = {};
			for (const table of selected) {
				rows[table] = await trx(table)
					.where({ tenant_uuid: sourceTenantUuid })
					.orderBy('created_at', 'asc');
			}

			// Build UUID remaps so FK columns point at the new rows, not
			// the source tenant's rows. Only build maps for tables we
			// actually copy — anything else stays NULL on the target.
			const groupMap = new Map<string, string>();
			const categoryMap = new Map<string, string>();
			const testItemMap = new Map<string, string>();
			const packageMap = new Map<string, string>();
			const doctorMap = new Map<string, string>();

			if (rows.doctors) for (const r of rows.doctors) doctorMap.set(r.uuid, uuidv4());
			if (rows.item_groups) for (const r of rows.item_groups) groupMap.set(r.uuid, uuidv4());
			if (rows.item_categories) for (const r of rows.item_categories) categoryMap.set(r.uuid, uuidv4());
			if (rows.test_items) for (const r of rows.test_items) testItemMap.set(r.uuid, uuidv4());
			if (rows.item_packages) for (const r of rows.item_packages) packageMap.set(r.uuid, uuidv4());

			const now = new Date();
			const stamp = (row: any) => ({ ...row, tenant_uuid: targetTenantUuid, created_at: now, updated_at: now });

			for (const table of selected) {
				const src = rows[table];
				if (!src?.length) {
					inserted[table] = 0;
					continue;
				}

				let out: any[];
				switch (table) {
					case 'doctors':
						out = src.map((d: any) =>
							stamp({ ...d, uuid: doctorMap.get(d.uuid)! }),
						);
						break;
					case 'discounts':
						out = src.map((d: any) => stamp({ ...d, uuid: uuidv4() }));
						break;
					case 'item_groups':
						out = src.map((g: any) =>
							stamp({
								...g,
								uuid: groupMap.get(g.uuid)!,
								signatory_doctor_uuid: g.signatory_doctor_uuid
									? doctorMap.get(g.signatory_doctor_uuid) ?? null
									: null,
							}),
						);
						break;
					case 'item_categories':
						out = src.map((c: any) => {
							const g = groupMap.get(c.item_group_uuid);
							if (!g) {
								throw new ConflictException(
									`item_categories.${c.code} references item_group ${c.item_group_uuid}, but item_groups was not included in the copy selection.`,
								);
							}
							return stamp({ ...c, uuid: categoryMap.get(c.uuid)!, item_group_uuid: g });
						});
						break;
					case 'test_items':
						out = src.map((t: any) => {
							const cat = categoryMap.get(t.item_category_uuid);
							if (!cat) {
								throw new ConflictException(
									`test_items.${t.code} references item_category ${t.item_category_uuid}, but item_categories was not included in the copy selection.`,
								);
							}
							return stamp({ ...t, uuid: testItemMap.get(t.uuid)!, item_category_uuid: cat });
						});
						break;
					case 'test_item_components':
						out = src.map((c: any) => {
							const ti = testItemMap.get(c.test_item_uuid);
							if (!ti) {
								throw new ConflictException(
									`test_item_components.${c.code} references test_item ${c.test_item_uuid}, but test_items was not included in the copy selection.`,
								);
							}
							return stamp({ ...c, uuid: uuidv4(), test_item_uuid: ti });
						});
						break;
					case 'item_packages':
						out = src.map((p: any) => stamp({ ...p, uuid: packageMap.get(p.uuid)! }));
						break;
					case 'item_package_items':
						out = src.map((pi: any) => {
							const pkg = packageMap.get(pi.item_package_uuid);
							const ti = testItemMap.get(pi.test_item_uuid);
							if (!pkg) {
								throw new ConflictException(
									`item_package_items references item_package ${pi.item_package_uuid}, but item_packages was not included in the copy selection.`,
								);
							}
							if (!ti) {
								throw new ConflictException(
									`item_package_items references test_item ${pi.test_item_uuid}, but test_items was not included in the copy selection.`,
								);
							}
							return stamp({ ...pi, uuid: uuidv4(), item_package_uuid: pkg, test_item_uuid: ti });
						});
						break;
					default:
						out = [];
				}

				if (out.length) await trx(table).insert(out);
				inserted[table] = out.length;
			}
		});

		return { source_tenant_uuid: sourceTenantUuid, target_tenant_uuid: targetTenantUuid, inserted };
	}

	// Internal: FK-safe delete of all transaction rows for a tenant, in a
	// single transaction so a mid-run error rolls everything back.
	private async runTransactionsDelete(tenantUuid: string) {
		const knex = Tenant.knex();
		const counts: Record<string, number> = {};
		await objectionTransaction(knex, async (trx) => {
			for (const table of TRANSACTION_DELETE_ORDER) {
				counts[table] = await trx(table).where({ tenant_uuid: tenantUuid }).delete();
			}
		});
		return counts;
	}
}
