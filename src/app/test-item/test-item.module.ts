import { Module } from '@nestjs/common';
import { TestItemController } from './test-item.controller';
import { TestItemService } from './test-item.service';

@Module({
	controllers: [TestItemController],
	providers: [TestItemService],
	exports: [TestItemService],
})
export class TestItemModule {}
