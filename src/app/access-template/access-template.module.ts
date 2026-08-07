import { Module } from '@nestjs/common';
import { AccessTemplateController } from './access-template.controller';
import { AccessTemplateService } from './access-template.service';

@Module({
	controllers: [AccessTemplateController],
	providers: [AccessTemplateService],
	exports: [AccessTemplateService],
})
export class AccessTemplateModule {}
