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
import { PlayerStatsQueryDto } from './dto/player-stats-query.dto'

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

  @Get(':id/players/:userId/stats')
  getPlayerStats(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Query() query: PlayerStatsQueryDto,
  ) {
    return this.statsService.getPlayerStats(req.user.id, id, userId, query)
  }

  /**
   * Devuelve los equipos del mismo club y mismo deporte donde el jugador
   * ha disputado al menos un partido finalizado, y a los que el viewer
   * tiene acceso. Se usa para el filtro multi-equipo de las stats
   * individuales del jugador.
   */
  @Get(':id/players/:userId/teams')
  getPlayerTeams(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.statsService.getPlayerTeamsForTeamContext(
      req.user.id,
      id,
      userId,
    )
  }
}