import { Knex } from 'knex';
import * as dotenv from 'dotenv';

dotenv.config({ path: `.env.${process.env.NODE_ENV || 'local'}` });

const config: Knex.Config = {
	client: 'pg',
	connection: {
		host: String(process.env.DB_SERVER),
		user: String(process.env.DB_USER),
		password: String(process.env.DB_PASSWORD),
		database: String(process.env.DB_DATABASE),
		port: Number(process.env.DB_PORT),
		timezone: 'local',
	},
	pool: {
		afterCreate: (conn: any, done: any) => {
			conn.query(`SET TIME ZONE 'Asia/Manila';`, (err: any) => {
				done(err, conn);
			});
		},
	},
	migrations: {
		directory: './migrations',
		extension: 'ts',
	},
	seeds: {
		directory: './seeds',
		extension: 'ts',
	},
};

export default config;
