import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import knex, { Knex } from 'knex';
import { Model } from 'objection';
import knexConfig from '../../knexfile';

@Injectable()
export class KnexService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(KnexService.name);
	public knex!: Knex;

	async onModuleInit() {
		this.knex = knex(knexConfig);
		Model.knex(this.knex);
		this.logger.log('Knex + Objection connection established.');
	}

	async onModuleDestroy() {
		if (this.knex) {
			await this.knex.destroy();
			this.logger.log('Knex connection destroyed.');
		}
	}
}
