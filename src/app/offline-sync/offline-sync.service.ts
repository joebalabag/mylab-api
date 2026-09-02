import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { Tenant } from '../tenant/tenant.model';
import { User } from '../user/user.model';
import { Patient } from '../patient/patient.model';
import { PatientCase } from '../patient-case/patient-case.model';
import { Payment } from '../payment/payment.model';
import { LabReport } from '../lab-report/lab-report.model';
import { PatientRequisition } from '../patient-requisition/patient-requisition.model';
import { PatientRequisitionItem } from '../patient-requisition/patient-requisition-item.model';
import { TestItem } from '../test-item/test-item.model';
import { ItemGroup } from '../item-group/item-group.model';
import { ItemCategory } from '../item-category/item-category.model';
import { ItemPackage } from '../item-package/item-package.model';
import { Doctor } from '../doctor/doctor.model';
import { Discount } from '../discount/discount.model';

import { OfflineDevice } from './offline-device.model';
import { SyncOutboxLog } from './sync-outbox-log.model';
import { IdempotencyService } from './idempotency.service';
import { SyncDispatcherService } from './sync-dispatcher.service';
import {
	EnableDeviceDTO,
	RefreshDeviceDTO,
	SyncBatchDTO,
	SyncEntryResult,
} from './dto/offline-sync.dto';

// Bootstrap window — rolling number of days of patient/case/payment/lab_report
// history a station downloads on first enable. Keep it configurable via env
// for tenants with unusual retention needs; the default matches product spec.
const OFFLINE_HISTORY_DAYS = Number(process.env.OFFLINE_HISTORY_DAYS || 60);
// Offline JWT lifetime — long enough to cover multi-day branch outages while
// still forcing a periodic re-validation to catch revoked devices.
const OFFLINE_JWT_EXPIRES_IN = process.env.OFFLINE_JWT_EXPIRES_IN || '30d';
// Warn (but don't reject) when device clock is off by more than this.
const CLOCK_SKEW_WARN_SECONDS = 5 * 60;

export interface OfflineActor {
	uuid: string;
	name: string;
	username: string;
	tenant_uuid?: string;
	type: string;
}

export interface OfflineTokenResult {
	access_token: string;
	device_id: string;
	device_uuid: string;
	expires_in: string;
	server_time: string;
}

@Injectable()
export class OfflineSyncService {
	constructor(
		private readonly jwt: JwtService,
		private readonly idempotency: IdempotencyService,
		private readonly dispatcher: SyncDispatcherService,
	) {}

	// ── Enable / refresh ───────────────────────────────────────────────────

	async enableDevice(actor: OfflineActor, dto: EnableDeviceDTO): Promise<OfflineTokenResult> {
		const tenant_uuid = this.requireTenant(actor);
		await this.assertTenantOptedIn(tenant_uuid);

		const now = new Date();
		const existing = (await OfflineDevice.query().findOne({
			tenant_uuid,
			device_id: dto.device_id,
		})) as unknown as OfflineDevice | undefined;

		let device: OfflineDevice;
		if (existing) {
			// Re-enable resets the revocation and refreshes the label / agent.
			device = (await OfflineDevice.query().patchAndFetchById(existing.uuid, {
				user_uuid: actor.uuid,
				device_label: dto.device_label ?? existing.device_label ?? null,
				user_agent: dto.user_agent ?? existing.user_agent ?? null,
				revoked_at: null,
				revoked_by: null,
				revoke_reason: null,
				last_seen_at: now,
				updated_by: actor.name,
			} as any)) as unknown as OfflineDevice;
		} else {
			device = (await OfflineDevice.query().insertAndFetch({
				tenant_uuid,
				user_uuid: actor.uuid,
				device_id: dto.device_id,
				device_label: dto.device_label ?? null,
				user_agent: dto.user_agent ?? null,
				first_enabled_at: now,
				last_seen_at: now,
				created_by: actor.name,
			} as any)) as unknown as OfflineDevice;
		}

		return this.mintOfflineToken(actor, tenant_uuid, device);
	}

	async refresh(actor: OfflineActor, dto: RefreshDeviceDTO): Promise<OfflineTokenResult & { clock_skew_seconds: number; skew_warning: boolean }> {
		const tenant_uuid = this.requireTenant(actor);
		const device = (await OfflineDevice.query().findOne({
			tenant_uuid,
			device_id: dto.device_id,
		})) as unknown as OfflineDevice | undefined;
		if (!device) throw new NotFoundException('Device not registered.');
		if (device.revoked_at) throw new ForbiddenException('Device offline access has been revoked.');

		const now = new Date();
		const deviceClock = new Date(dto.device_clock);
		const skew = Math.round((deviceClock.getTime() - now.getTime()) / 1000);

		await OfflineDevice.query().patchAndFetchById(device.uuid, {
			last_seen_at: now,
			updated_by: actor.name,
		} as any);

		const token = await this.mintOfflineToken(actor, tenant_uuid, device);
		return {
			...token,
			clock_skew_seconds: skew,
			skew_warning: Math.abs(skew) > CLOCK_SKEW_WARN_SECONDS,
		};
	}

	async revokeDevice(actor: OfflineActor, device_uuid: string, reason?: string): Promise<OfflineDevice> {
		const tenant_uuid = this.requireTenant(actor);
		const device = (await OfflineDevice.query().findOne({
			uuid: device_uuid,
			tenant_uuid,
		})) as unknown as OfflineDevice | undefined;
		if (!device) throw new NotFoundException('Device not found.');
		return (await OfflineDevice.query().patchAndFetchById(device.uuid, {
			revoked_at: new Date(),
			revoked_by: actor.name,
			revoke_reason: reason ?? null,
			updated_by: actor.name,
		} as any)) as unknown as OfflineDevice;
	}

	async listDevices(actor: OfflineActor): Promise<OfflineDevice[]> {
		const tenant_uuid = this.requireTenant(actor);
		return OfflineDevice.query()
			.where({ tenant_uuid })
			.orderBy('last_seen_at', 'desc') as unknown as Promise<OfflineDevice[]>;
	}

	// ── Bootstrap / pull ───────────────────────────────────────────────────

	/**
	 * First-time cache seed for a station. Payload is deliberately fat — the
	 * client stores everything in IndexedDB and never re-downloads on every
	 * page load, only on incremental /pull. See docs/OFFLINE_MODE.md.
	 */
	async bootstrap(actor: OfflineActor): Promise<Record<string, any>> {
		const tenant_uuid = this.requireTenant(actor);
		await this.assertTenantOptedIn(tenant_uuid);

		const cutoff = this.rollingCutoff();

		const [
			tenant, reference, patients, cases, requisitions, requisitionItems, payments, labReports,
		] = await Promise.all([
			Tenant.query().findById(tenant_uuid),
			this.loadReferenceData(tenant_uuid),
			Patient.query().where({ tenant_uuid }).where('created_at', '>=', cutoff),
			PatientCase.query().where({ tenant_uuid }).where('created_at', '>=', cutoff),
			PatientRequisition.query().where({ tenant_uuid }).where('created_at', '>=', cutoff),
			// Items load off the requisitions they belong to — same rolling
			// window as the parent set.
			PatientRequisitionItem.query()
				.alias('pri')
				.innerJoin('patient_requisitions as pr', 'pr.uuid', 'pri.patient_requisition_uuid')
				.where('pri.tenant_uuid', tenant_uuid)
				.where('pr.created_at', '>=', cutoff)
				.select('pri.*'),
			Payment.query().where({ tenant_uuid }).where('created_at', '>=', cutoff),
			LabReport.query().where({ tenant_uuid }).where('created_at', '>=', cutoff),
		]);

		return {
			tenant,
			reference,
			patients,
			patient_cases: cases,
			patient_requisitions: requisitions,
			patient_requisition_items: requisitionItems,
			payments,
			lab_reports: labReports,
			server_time: new Date().toISOString(),
			history_days: OFFLINE_HISTORY_DAYS,
		};
	}

	async pull(actor: OfflineActor, since: string): Promise<Record<string, any>> {
		const tenant_uuid = this.requireTenant(actor);
		await this.assertTenantOptedIn(tenant_uuid);
		const sinceDate = new Date(since);
		if (Number.isNaN(sinceDate.getTime())) throw new BadRequestException('`since` must be a valid ISO timestamp.');

		const [
			reference, patients, cases, requisitions, requisitionItems, payments, labReports,
		] = await Promise.all([
			this.loadReferenceData(tenant_uuid),
			Patient.query().where({ tenant_uuid }).where('updated_at', '>', sinceDate),
			PatientCase.query().where({ tenant_uuid }).where('updated_at', '>', sinceDate),
			PatientRequisition.query().where({ tenant_uuid }).where('updated_at', '>', sinceDate),
			PatientRequisitionItem.query().where({ tenant_uuid }).where('updated_at', '>', sinceDate),
			Payment.query().where({ tenant_uuid }).where('updated_at', '>', sinceDate),
			LabReport.query().where({ tenant_uuid }).where('updated_at', '>', sinceDate),
		]);

		return {
			reference,
			patients,
			patient_cases: cases,
			patient_requisitions: requisitions,
			patient_requisition_items: requisitionItems,
			payments,
			lab_reports: labReports,
			server_time: new Date().toISOString(),
		};
	}

	// ── Sync ───────────────────────────────────────────────────────────────

	async sync(actor: OfflineActor, dto: SyncBatchDTO): Promise<{ results: SyncEntryResult[]; server_time: string }> {
		const tenant_uuid = this.requireTenant(actor);
		await this.assertTenantOptedIn(tenant_uuid);
		await this.assertDeviceActive(tenant_uuid, dto.device_id);

		const results: SyncEntryResult[] = [];
		const syncStartedAt = new Date();

		for (const entry of dto.entries) {
			const endpoint = `sync:${entry.entity_type}`;
			const cached = await this.idempotency.lookup(tenant_uuid, endpoint, entry.idempotency_key);
			if (cached) {
				results.push({
					entity_type: entry.entity_type,
					client_uuid: entry.client_uuid,
					idempotency_key: entry.idempotency_key,
					status: 'duplicate',
					...(cached.snapshot as any),
				});
				continue;
			}

			const dispatched = await this.dispatcher.dispatch(entry, {
				tenant_uuid,
				acting_user: { uuid: actor.uuid, name: actor.name },
			});

			const result: SyncEntryResult = {
				entity_type: entry.entity_type,
				client_uuid: entry.client_uuid,
				idempotency_key: entry.idempotency_key,
				...dispatched,
			};
			results.push(result);

			// Cache the outcome (success OR conflict) so a retry short-circuits.
			// Raw errors are NOT cached — the client may fix the input and retry.
			if (result.status === 'ok' || result.status === 'duplicate' || result.status === 'conflict') {
				await this.idempotency.store(tenant_uuid, endpoint, entry.idempotency_key, {
					status: result.status,
					server_uuid: result.server_uuid,
					server_row: result.server_row,
					error: result.error,
				});
			}

			// Audit log — always, even on error, so investigators can trace
			// what the branch tried to send.
			const createdOffline = new Date(entry.created_offline_at);
			const skew = Number.isFinite(createdOffline.getTime())
				? Math.round((createdOffline.getTime() - syncStartedAt.getTime()) / 1000)
				: null;
			await SyncOutboxLog.query().insert({
				tenant_uuid,
				device_id: dto.device_id,
				user_uuid: actor.uuid,
				entity_type: entry.entity_type as any,
				entity_uuid: entry.client_uuid,
				server_uuid: result.server_uuid ?? null,
				idempotency_key: entry.idempotency_key,
				created_offline_at: Number.isFinite(createdOffline.getTime()) ? createdOffline : null,
				synced_at: syncStartedAt,
				clock_skew_seconds: skew,
				status: result.status,
				error: result.error ?? null,
			} as any);
		}

		// Bump device last_sync_at once per batch.
		await OfflineDevice.query()
			.patch({ last_sync_at: syncStartedAt, last_seen_at: syncStartedAt } as any)
			.where({ tenant_uuid, device_id: dto.device_id });

		return { results, server_time: syncStartedAt.toISOString() };
	}

	// ── Internals ──────────────────────────────────────────────────────────

	private requireTenant(actor: OfflineActor): string {
		if (!actor.tenant_uuid) throw new ForbiddenException('Offline sync requires a tenant-scoped user.');
		return actor.tenant_uuid;
	}

	private async assertTenantOptedIn(tenant_uuid: string): Promise<void> {
		const t = (await Tenant.query().findById(tenant_uuid)) as unknown as Tenant | undefined;
		if (!t) throw new NotFoundException('Tenant not found.');
		if (!(t as any).offline_mode_enabled) {
			throw new ForbiddenException('Offline mode is not enabled for this tenant.');
		}
	}

	private async assertDeviceActive(tenant_uuid: string, device_id: string): Promise<void> {
		const device = (await OfflineDevice.query().findOne({ tenant_uuid, device_id })) as unknown as OfflineDevice | undefined;
		if (!device) throw new ForbiddenException('Unknown offline device — call /offline/enable first.');
		if (device.revoked_at) throw new ForbiddenException('Device offline access has been revoked.');
	}

	private rollingCutoff(): Date {
		const d = new Date();
		d.setDate(d.getDate() - OFFLINE_HISTORY_DAYS);
		return d;
	}

	private async loadReferenceData(tenant_uuid: string): Promise<Record<string, unknown>> {
		const [testItems, itemGroups, itemCategories, itemPackages, doctors, discounts, users] = await Promise.all([
			TestItem.query().where({ tenant_uuid }),
			ItemGroup.query().where({ tenant_uuid }),
			ItemCategory.query().where({ tenant_uuid }),
			ItemPackage.query().where({ tenant_uuid }),
			Doctor.query().where({ tenant_uuid }),
			Discount.query().where({ tenant_uuid }),
			// Users are cached so the login screen can validate cached passwords
			// offline. Password hashes are already only on the server. See Phase 3
			// for the auth story — for now we return the visible profile fields
			// only (no passphrase/keycode).
			User.query()
				.where({ tenant_uuid })
				.select('uuid', 'username', 'name', 'role', 'status', 'tenant_uuid'),
		]);
		return { test_items: testItems, item_groups: itemGroups, item_categories: itemCategories, item_packages: itemPackages, doctors, discounts, users };
	}

	private async mintOfflineToken(
		actor: OfflineActor,
		tenant_uuid: string,
		device: OfflineDevice,
	): Promise<OfflineTokenResult> {
		// Phase 3 will formalize the payload shape + guard-side handling. For
		// now the token carries the same fields as a user token plus an
		// `offline: true` marker and the device_id so the guard can look up
		// (and reject) revoked devices on every request.
		const access_token = this.jwt.sign(
			{
				uuid: actor.uuid,
				username: actor.username,
				name: actor.name,
				tenant_uuid,
				type: 'user',
				offline: true,
				device_id: device.device_id,
			},
			{ expiresIn: OFFLINE_JWT_EXPIRES_IN as any },
		);
		return {
			access_token,
			device_id: device.device_id,
			device_uuid: device.uuid,
			expires_in: OFFLINE_JWT_EXPIRES_IN,
			server_time: new Date().toISOString(),
		};
	}
}
