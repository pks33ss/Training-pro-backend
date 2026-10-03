import { Module } from '@nestjs/common'
import { StatsController } from './stats.controller'
import { TeamStatsService } from './stats.service'
import { BasketballStatsService } from './basketball-stats.service'
import { StatsConfigController } from './stats-config.controller'
import { StatsConfigService } from './stats-config.service'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StatsController, StatsConfigController],
  providers: [TeamStatsService, BasketballStatsService, StatsConfigService],
  exports: [TeamStatsService, StatsConfigService],
})
export class StatsModule {}