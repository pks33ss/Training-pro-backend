import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { TeamStatsService } from './stats.service'
import { TeamStatsQueryDto } from './dto/team-stats-query.dto'

@UseGuards(AuthGuard)
@Controller('teams')
export class StatsController {
  constructor(private readonly statsService: TeamStatsService) {}

  @Get(':id/stats')
  getTeamStats(
    @Request() req,
    @Param('id') id: string,
    @Query() query: TeamStatsQueryDto,
  ) {
    return this.statsService.getTeamStats(req.user.id, id, query)
  }
}