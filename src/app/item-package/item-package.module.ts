import { Module } from '@nestjs/common';
import { ItemPackageController } from './item-package.controller';
import { ItemPackageService } from './item-package.service';

@Module({
	controllers: [ItemPackageController],
	providers: [ItemPackageService],
	exports: [ItemPackageService],
})
export class ItemPackageModule {}
