import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { AuditService } from './audit-log.service';

const JOB_NAME = 'pruneAuditLogs';

/**
 * 03:00 Asia/Manila every day. Hard-deletes audit_logs rows older than the
 * configured retention window (default 12 months) in chunks so a very long-
 * neglected table doesn't blow up the WAL in a single transaction.
 *
 * Overrides:
 *   AUDIT_LOG_PRUNE_CRON        — cron expression (default "0 3 * * *")
 *   AUDIT_LOG_PRUNE_TZ          — timezone (default "Asia/Manila")
 *   AUDIT_LOG_RETENTION_MONTHS  — integer, default 12. Set 0 to disable pruning.
 */
const DEFAULT_SCHEDULE = '0 3 * * *';
const DEFAULT_TIMEZONE = 'Asia/Manila';
const DEFAULT_RETENTION_MONTHS = 12;

@Injectable()
export class AuditLogCron implements OnModuleInit {
	private readonly logger = new Logger(AuditLogCron.name);

	constructor(
		private readonly service: AuditService,
		private readonly config: ConfigService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {}

	onModuleInit(): void {
		const months = Number(this.config.get('AUDIT_LOG_RETENTION_MONTHS') ?? DEFAULT_RETENTION_MONTHS);
		if (!Number.isFinite(months) || months <= 0) {
			this.logger.log(`${JOB_NAME} disabled (AUDIT_LOG_RETENTION_MONTHS=${months}).`);
			return;
		}

		const schedule = this.config.get<string>('AUDIT_LOG_PRUNE_CRON') || DEFAULT_SCHEDULE;
		const timeZone = this.config.get<string>('AUDIT_LOG_PRUNE_TZ')   || DEFAULT_TIMEZONE;

		let job: CronJob;
		try {
			job = new CronJob(schedule, () => this.run(months), null, false, timeZone);
		} catch (err: any) {
			this.logger.error(
				`Invalid AUDIT_LOG_PRUNE_CRON="${schedule}" or timezone="${timeZone}" — ` +
				`falling back to default "${DEFAULT_SCHEDULE}" (${DEFAULT_TIMEZONE}). Reason: ${err?.message}`,
			);
			job = new CronJob(DEFAULT_SCHEDULE, () => this.run(months), null, false, DEFAULT_TIMEZONE);
		}

		this.schedulerRegistry.addCronJob(JOB_NAME, job as any);
		job.start();

		this.logger.log(
			`Registered job: ${JOB_NAME} — schedule "${schedule}" (${timeZone}) — ` +
			`deletes audit_logs rows older than ${months} month(s).`,
		);
	}

	private async run(retentionMonths: number): Promise<void> {
		const startedAt = Date.now();
		const cutoff = new Date();
		cutoff.setMonth(cutoff.getMonth() - retentionMonths);
		this.logger.log(`Running job: ${JOB_NAME} (cutoff ${cutoff.toISOString()})`);
		try {
			const deleted = await this.service.pruneOlderThan(cutoff);
			this.logger.log(
				`Job ${JOB_NAME} finished in ${Date.now() - startedAt}ms — pruned ${deleted} row(s).`,
			);
		} catch (err: any) {
			this.logger.error(
				`Job ${JOB_NAME} failed after ${Date.now() - startedAt}ms: ${err?.message}`,
				err?.stack,
			);
		}
	}
}
