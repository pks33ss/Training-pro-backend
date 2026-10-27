// backend/src/live-events/live-events.module.ts

import { Module } from '@nestjs/common'
import { LiveEventsService } from './live-events.service'
import { LiveEventsController } from './live-events.controller'
import { LiveStatsSseService } from './live-stats-sse.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [LiveEventsController],
  providers: [LiveEventsService, LiveStatsSseService],
  exports: [LiveEventsService, LiveStatsSseService],
})
export class LiveEventsModule {}