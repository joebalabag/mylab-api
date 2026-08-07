process.env.TZ = 'Asia/Manila';

// Load .env.<NODE_ENV> with override:true BEFORE Nest boots. Without this,
// dotenv (used by ConfigModule under the hood) refuses to overwrite any
// process.env value already set by PM2, Jenkins, or the shell — which meant
// PORT stayed on the shell's default (3010) even when .env.staging said 7030.
import * as dotenv from 'dotenv';
import { resolve as resolvePath } from 'path';
const envFile = `.env.${process.env.NODE_ENV || 'local'}`;
const envLoadResult = dotenv.config({ path: resolvePath(process.cwd(), envFile), override: true });

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BadRequestException, ConsoleLogger, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import * as morgan from 'morgan';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		logger: new ConsoleLogger({
			prefix: 'MyLab',
			colors: true,
		}),
	});

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
			// Replace underscore-separated property names with space-separated
			// versions in every validation message so responses read naturally
			// (e.g., "contact number must be..." instead of "contact_number must be...").
			exceptionFactory: (errors) => {
				const messages = flattenValidationMessages(errors);
				return new BadRequestException({
					message: messages,
					error: 'Bad Request',
					statusCode: 400,
				});
			},
		})
	);

	// Serve /public folder as static assets (uploaded files)
	const publicDir = join(process.cwd(), 'public');
	if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
	app.useStaticAssets(publicDir, { prefix: '/public/' });

	const swaggerConfig = new DocumentBuilder()
		.setTitle('MyLab API')
		.setDescription('MyLab backend')
		.addServer('/api')
		.setVersion('1.0')
		.addBearerAuth(
			{
				type: 'http',
				scheme: 'bearer',
				bearerFormat: 'JWT',
				name: 'JWT',
				description: 'Enter JWT token',
				in: 'header',
			},
			'access-token'
		)
		.build();

	const document = SwaggerModule.createDocument(app, swaggerConfig);
	SwaggerModule.setup('api-docs', app, document, {
		swaggerOptions: {
			persistAuthorization: true,
		},
	});

	// CORS — allow a comma-separated list of frontend origins from the env,
	// or fall back to a sensible set of dev + production URLs. Browsers reject
	// `origin: '*'` the moment credentials are sent, so we always echo the
	// exact origin back when it matches the allowlist.
	const envOrigins = String(process.env.CORS_ORIGINS || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const defaultOrigins = [
		'http://localhost:5173',
		'http://localhost:3000',
		'http://localhost:3010',
		'http://127.0.0.1:3010',
		'http://MyLab.edgetechph.net',
		'https://MyLab.edgetechph.net',
	];
	const allowedOrigins = envOrigins.length ? envOrigins : defaultOrigins;
	app.enableCors({
		origin: (origin, cb) => {
			// No Origin header (curl, mobile app, server-to-server) → allow.
			if (!origin) return cb(null, true);
			if (allowedOrigins.includes(origin)) return cb(null, true);
			return cb(new Error(`CORS blocked: ${origin}`), false);
		},
		credentials: true,
		methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
	});
	Logger.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);

	app.setGlobalPrefix('api');
	app.use(morgan(':remote-addr - :method :url :status :response-time ms'));

	await app.listen(process.env.PORT ?? 3010);

	Logger.log(`Application is running on: ${await app.getUrl()}`);
	Logger.log(`Application is running on ENV: ${process.env.NODE_ENV}`);
	Logger.log(`Timezone: ${process.env.TZ}`);
	Logger.log(`Loaded env file: ${envFile} (${envLoadResult.error ? 'NOT FOUND / error: ' + envLoadResult.error.message : 'ok'})`);
	Logger.log(`Effective PORT: ${process.env.PORT ?? '(unset — using fallback 3010)'}`);
}
bootstrap();

function flattenValidationMessages(errors: ValidationError[], parentPath = ''): string[] {
	const out: string[] = [];
	for (const err of errors) {
		const path = parentPath ? `${parentPath}.${err.property}` : err.property;
		const friendlyPath = path.replace(/_/g, ' ');
		if (err.constraints) {
			for (const msg of Object.values(err.constraints)) {
				// Replace exact underscored property/path occurrences with the friendly version.
				const friendly = msg.split(path).join(friendlyPath).split(err.property).join(err.property.replace(/_/g, ' '));
				out.push(friendly);
			}
		}
		if (err.children?.length) out.push(...flattenValidationMessages(err.children, path));
	}
	return out;
}
