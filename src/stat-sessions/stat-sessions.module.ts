// backend/src/stat-sessions/stat-sessions.module.ts

import { Module } from '@nestjs/common'
import { StatSessionsService } from './stat-sessions.service'
import { StatSessionsController } from './stat-sessions.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [StatSessionsController],
  providers: [StatSessionsService],
  exports: [StatSessionsService],
})
export class StatSessionsModule {}