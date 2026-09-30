import { Module } from '@nestjs/common'
import { StatsController } from './stats.controller'
import { TeamStatsService } from './stats.service'
import { BasketballStatsService } from './basketball-stats.service'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StatsController],
  providers: [TeamStatsService, BasketballStatsService],
  exports: [TeamStatsService],
})
export class StatsModule {}