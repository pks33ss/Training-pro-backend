// backend/src/match-import/match-import.module.ts

import { Module } from '@nestjs/common'
import { MatchImportService } from './match-import.service'
import { MatchImportController } from './match-import.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [MatchImportController],
  providers: [MatchImportService],
  exports: [MatchImportService],
})
export class MatchImportModule {}