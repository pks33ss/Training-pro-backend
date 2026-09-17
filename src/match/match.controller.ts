import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards } from '@nestjs/common'
import { MatchService } from './match.service'
import { CreateMatchDto } from './dto/create-match.dto'
import { UpdateMatchDto } from './dto/update-match.dto'
import { UpdateResultDto } from './dto/update-result.dto'
import { UpdateStatsDto } from './dto/update-stats.dto'
import { AuthGuard } from '../auth/auth.guard'

@Controller('matches')
@UseGuards(AuthGuard)
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  // ============================================
  // CRUD PARTIDOS
  // ============================================

  @Post()
  create(@Request() req, @Body() createMatchDto: CreateMatchDto) {
    return this.matchService.create(req.user.id, createMatchDto)
  }

  @Get('team/:teamId')
  findAllByTeam(@Request() req, @Param('teamId') teamId: string) {
    return this.matchService.findAllByTeam(req.user.id, teamId)
  }

  @Get('team/:teamId/stats')
  getTeamStats(@Request() req, @Param('teamId') teamId: string) {
    return this.matchService.getTeamStats(req.user.id, teamId)
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.matchService.findOne(req.user.id, id)
  }

  @Put(':id')
  update(@Request() req, @Param('id') id: string, @Body() updateMatchDto: UpdateMatchDto) {
    return this.matchService.update(req.user.id, id, updateMatchDto)
  }

  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.matchService.remove(req.user.id, id)
  }

  // ============================================
  // RESULTADO
  // ============================================

  @Put(':id/result')
  updateResult(@Request() req, @Param('id') id: string, @Body() updateResultDto: UpdateResultDto) {
    return this.matchService.updateResult(req.user.id, id, updateResultDto)
  }

  // ============================================
  // CONVOCATORIA
  // ============================================

  @Post(':id/callups')
  createCallups(@Request() req, @Param('id') id: string, @Body('playerIds') playerIds: string[]) {
    return this.matchService.createCallups(req.user.id, id, playerIds)
  }

  @Get(':id/callups')
  getCallups(@Request() req, @Param('id') id: string) {
    return this.matchService.getCallups(req.user.id, id)
  }

  @Put(':id/callups/:playerId')
  updateCallupStatus(
    @Request() req,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
    @Body('status') status: string,
    @Body('notes') notes?: string,
  ) {
    return this.matchService.updateCallupStatus(req.user.id, id, playerId, status, notes)
  }

  @Delete(':id/callups/:playerId')
  removeCallup(
    @Request() req,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
  ) {
    return this.matchService.removeCallup(req.user.id, id, playerId)
  }

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  @Post(':id/stats/:playerId')
  upsertPlayerStats(
    @Request() req,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
    @Body() stats: UpdateStatsDto,
  ) {
    return this.matchService.upsertPlayerStats(req.user.id, id, playerId, stats)
  }

  @Get(':id/stats')
  getPlayerStats(@Request() req, @Param('id') id: string) {
    return this.matchService.getPlayerStats(req.user.id, id)
  }
    // ============================================
  // LINE UP
  // ============================================

  @Put(':id/lineup')
  updateLineup(
    @Request() req,
    @Param('id') id: string,
    @Body('lineup') lineup: any,
  ) {
    return this.matchService.updateLineup(req.user.id, id, lineup)
  }

  // ============================================
  // PLAN DE PARTIDO
  // ============================================

  @Put(':id/game-plan')
  updateGamePlan(
    @Request() req,
    @Param('id') id: string,
    @Body('gamePlan') gamePlan: string,
  ) {
    return this.matchService.updateGamePlan(req.user.id, id, gamePlan)
  }
}