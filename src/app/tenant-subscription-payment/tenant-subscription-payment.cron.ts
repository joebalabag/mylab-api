import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { TenantSubscriptionPaymentService } from './tenant-subscription-payment.service';

const JOB_NAME = 'promoteScheduled';
const DEFAULT_SCHEDULE = '0 * * * *';

@Injectable()
export class TenantSubscriptionPaymentCron implements OnModuleInit {
	private readonly logger = new Logger(TenantSubscriptionPaymentCron.name);

	constructor(
		private readonly service: TenantSubscriptionPaymentService,
		private readonly config: ConfigService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {}

	onModuleInit(): void {
		const schedule = this.config.get<string>('SUBSCRIPTION_PROMOTION_CRON') || DEFAULT_SCHEDULE;

		let job: CronJob;
		try {
			job = new CronJob(schedule, () => this.run());
		} catch (err: any) {
			this.logger.error(
				`Invalid SUBSCRIPTION_PROMOTION_CRON="${schedule}" — falling back to default "${DEFAULT_SCHEDULE}". Reason: ${err?.message}`
			);
			job = new CronJob(DEFAULT_SCHEDULE, () => this.run());
		}

		this.schedulerRegistry.addCronJob(JOB_NAME, job as any);
		job.start();

		this.logger.log(
			`Registered job: ${JOB_NAME} — schedule "${schedule}" — promotes due 'scheduled' subscriptions to 'active'.`
		);
	}

	private async run(): Promise<void> {
		const startedAt = Date.now();
		this.logger.log(`Running job: ${JOB_NAME}`);
		try {
			const promoted = await this.service.promoteScheduledSubscriptions();
			this.logger.log(
				`Job ${JOB_NAME} finished in ${Date.now() - startedAt}ms — promoted ${promoted} subscription(s).`
			);
		} catch (err: any) {
			this.logger.error(
				`Job ${JOB_NAME} failed after ${Date.now() - startedAt}ms: ${err?.message}`,
				err?.stack
			);
		}
	}
}
