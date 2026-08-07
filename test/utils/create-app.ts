import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = moduleRef.createNestApplication<NestExpressApplication>();

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		})
	);

	const publicDir = join(process.cwd(), 'public');
	if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
	app.useStaticAssets(publicDir, { prefix: '/public/' });

	app.setGlobalPrefix('api');
	await app.init();
	return app;
}
