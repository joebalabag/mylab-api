import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { TenantSubscriptionPaymentService } from './tenant-subscription-payment.service';

const JOB_NAME = 'notifyNearExpirySubscriptions';
const DEFAULT_SCHEDULE = '0 2 * * *';
const DEFAULT_TIMEZONE = 'Asia/Manila';

@Injectable()
export class TenantSubscriptionExpiryWarningCron implements OnModuleInit {
	private readonly logger = new Logger(TenantSubscriptionExpiryWarningCron.name);

	constructor(
		private readonly service: TenantSubscriptionPaymentService,
		private readonly config: ConfigService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {}

	onModuleInit(): void {
		const schedule = this.config.get<string>('SUBSCRIPTION_EXPIRY_WARNING_CRON') || DEFAULT_SCHEDULE;
		const timeZone = this.config.get<string>('SUBSCRIPTION_EXPIRY_WARNING_TZ') || DEFAULT_TIMEZONE;

		let job: CronJob;
		try {
			job = new CronJob(schedule, () => this.run(), null, false, timeZone);
		} catch (err: any) {
			this.logger.error(
				`Invalid SUBSCRIPTION_EXPIRY_WARNING_CRON="${schedule}" or timezone="${timeZone}" — ` +
				`falling back to "${DEFAULT_SCHEDULE}" (${DEFAULT_TIMEZONE}). Reason: ${err?.message}`,
			);
			job = new CronJob(DEFAULT_SCHEDULE, () => this.run(), null, false, DEFAULT_TIMEZONE);
		}

		this.schedulerRegistry.addCronJob(JOB_NAME, job as any);
		job.start();

		this.logger.log(
			`Registered job: ${JOB_NAME} — schedule "${schedule}" (${timeZone}) — ` +
			`emails tenant owners whose subscription expires within the warning window.`,
		);
	}

	private async run(): Promise<void> {
		const startedAt = Date.now();
		this.logger.log(`Running job: ${JOB_NAME}`);
		try {
			const notified = await this.service.notifyNearExpirySubscriptions();
			this.logger.log(
				`Job ${JOB_NAME} finished in ${Date.now() - startedAt}ms — notified ${notified} tenant(s).`,
			);
		} catch (err: any) {
			this.logger.error(
				`Job ${JOB_NAME} failed after ${Date.now() - startedAt}ms: ${err?.message}`,
				err?.stack,
			);
		}
	}
}
