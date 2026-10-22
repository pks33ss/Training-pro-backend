// backend/src/live-events/live-events.module.ts

import { Module } from '@nestjs/common'
import { LiveEventsService } from './live-events.service'
import { LiveEventsController } from './live-events.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [LiveEventsController],
  providers: [LiveEventsService],
  exports: [LiveEventsService],
})
export class LiveEventsModule {}