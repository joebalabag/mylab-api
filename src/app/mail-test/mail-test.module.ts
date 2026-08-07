import { Module } from '@nestjs/common';
import { MailTestController } from './mail-test.controller';

@Module({
	controllers: [MailTestController],
})
export class MailTestModule {}
