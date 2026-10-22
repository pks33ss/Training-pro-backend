// backend/src/stat-sessions/stat-sessions.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { StatSessionsService } from './stat-sessions.service'
import { CreateStatSessionDto } from './dto/create-stat-session.dto'
import { UpdateStatSessionDto } from './dto/update-stat-session.dto'
import { UpdateSessionPlayerStatsDto } from './dto/update-session-player-stats.dto'
import { ListStatSessionsQueryDto } from './dto/list-stat-sessions-query.dto'

@UseGuards(AuthGuard)
@Controller()
export class StatSessionsController {
  constructor(private readonly service: StatSessionsService) {}

  // ─── Bajo /teams/:teamId ──────────────────────────────

  @Get('teams/:teamId/stat-sessions')
  list(
    @Request() req,
    @Param('teamId') teamId: string,
    @Query() query: ListStatSessionsQueryDto,
  ) {
    return this.service.listByTeam(req.user.id, teamId, query)
  }

  @Post('teams/:teamId/stat-sessions')
  create(
    @Request() req,
    @Param('teamId') teamId: string,
    @Body() dto: CreateStatSessionDto,
  ) {
    return this.service.create(req.user.id, teamId, dto)
  }

  // ─── Bajo /stat-sessions/:id ──────────────────────────

  @Get('stat-sessions/:id')
  getOne(@Request() req, @Param('id') id: string) {
    return this.service.getOne(req.user.id, id)
  }

  @Patch('stat-sessions/:id')
  updateHeader(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateStatSessionDto,
  ) {
    return this.service.updateHeader(req.user.id, id, dto)
  }

  @Delete('stat-sessions/:id')
  remove(@Request() req, @Param('id') id: string) {
    return this.service.remove(req.user.id, id)
  }

  // ─── Jugadores dentro de la sesión ────────────────────

  @Post('stat-sessions/:id/players/:userId')
  addPlayer(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.service.addPlayer(req.user.id, id, userId)
  }

  @Delete('stat-sessions/:id/players/:userId')
  removePlayer(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.service.removePlayer(req.user.id, id, userId)
  }

  @Patch('stat-sessions/:id/players/:userId')
  updatePlayerStats(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateSessionPlayerStatsDto,
  ) {
    return this.service.updatePlayerStats(req.user.id, id, userId, dto)
  }

    @Get('stat-sessions/:id/candidates')
  getCandidates(@Request() req, @Param('id') id: string) {
    return this.service.getCandidates(req.user.id, id)
  }
}