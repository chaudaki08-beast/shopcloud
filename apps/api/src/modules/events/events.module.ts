import { Module, Global } from '@nestjs/common';
import { EventsService } from './events.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [EventsService, OutboxService],
  exports: [EventsService, OutboxService],
})
export class EventsModule {}
