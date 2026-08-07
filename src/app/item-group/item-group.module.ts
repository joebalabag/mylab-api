import { Module } from '@nestjs/common';
import { ItemGroupController } from './item-group.controller';
import { ItemGroupService } from './item-group.service';

@Module({
	controllers: [ItemGroupController],
	providers: [ItemGroupService],
	exports: [ItemGroupService],
})
export class ItemGroupModule {}
