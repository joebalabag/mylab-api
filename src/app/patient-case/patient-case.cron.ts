import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { PatientCaseService } from './patient-case.service';

const JOB_NAME = 'autoCloseOpenDailyCases';

/**
 * 00:00 Asia/Manila every day. Sweeps every OPEN OPD / ER patient case
 * and closes it (see PatientCaseService.autoCloseOpenDailyCases for the
 * exact update rules). IPD cases are intentionally left alone — those
 * are in-patient admissions that legitimately span multiple days.
 *
 * Override with the env var PATIENT_CASE_AUTOCLOSE_CRON, e.g.
 *   PATIENT_CASE_AUTOCLOSE_CRON="0 23 * * *"
 * The timezone is fixed to Asia/Manila — matches the app's tenant
 * default; override at deploy time via PATIENT_CASE_AUTOCLOSE_TZ if a
 * tenant fleet lands in another region.
 */
const DEFAULT_SCHEDULE = '0 0 * * *';
const DEFAULT_TIMEZONE = 'Asia/Manila';

@Injectable()
export class PatientCaseCron implements OnModuleInit {
	private readonly logger = new Logger(PatientCaseCron.name);

	constructor(
		private readonly service: PatientCaseService,
		private readonly config: ConfigService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {}

	onModuleInit(): void {
		const schedule = this.config.get<string>('PATIENT_CASE_AUTOCLOSE_CRON') || DEFAULT_SCHEDULE;
		const timeZone = this.config.get<string>('PATIENT_CASE_AUTOCLOSE_TZ')   || DEFAULT_TIMEZONE;

		let job: CronJob;
		try {
			job = new CronJob(schedule, () => this.run(), null, false, timeZone);
		} catch (err: any) {
			this.logger.error(
				`Invalid PATIENT_CASE_AUTOCLOSE_CRON="${schedule}" or timezone="${timeZone}" — ` +
				`falling back to default "${DEFAULT_SCHEDULE}" (${DEFAULT_TIMEZONE}). Reason: ${err?.message}`,
			);
			job = new CronJob(DEFAULT_SCHEDULE, () => this.run(), null, false, DEFAULT_TIMEZONE);
		}

		this.schedulerRegistry.addCronJob(JOB_NAME, job as any);
		job.start();

		this.logger.log(
			`Registered job: ${JOB_NAME} — schedule "${schedule}" (${timeZone}) — ` +
			`auto-closes OPEN OPD / ER patient_cases and stamps discharge_date when null.`,
		);
	}

	private async run(): Promise<void> {
		const startedAt = Date.now();
		this.logger.log(`Running job: ${JOB_NAME}`);
		try {
			const closed = await this.service.autoCloseOpenDailyCases();
			this.logger.log(
				`Job ${JOB_NAME} finished in ${Date.now() - startedAt}ms — closed ${closed} patient case(s).`,
			);
		} catch (err: any) {
			this.logger.error(
				`Job ${JOB_NAME} failed after ${Date.now() - startedAt}ms: ${err?.message}`,
				err?.stack,
			);
		}
	}
}
