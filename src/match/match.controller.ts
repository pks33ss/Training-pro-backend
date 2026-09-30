import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common'
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

    @Get(':id/padel-stats')
  getPadelStats(@Request() req, @Param('id') id: string) {
    return this.matchService.getPadelStats(req.user.id, id)
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

  @Put(':id/result')
  updateResult(@Request() req, @Param('id') id: string, @Body() updateResultDto: UpdateResultDto) {
    return this.matchService.updateResult(req.user.id, id, updateResultDto)
  }

  // ============================================
  // CONVOCATORIA
  // ============================================

  // ✅ Ahora el body usa userIds
  @Post(':id/callups')
  createCallups(
    @Request() req,
    @Param('id') id: string,
    @Body('userIds') userIds: string[],
  ) {
    return this.matchService.createCallups(req.user.id, id, userIds)
  }

  @Get(':id/callups')
  getCallups(@Request() req, @Param('id') id: string) {
    return this.matchService.getCallups(req.user.id, id)
  }

  // ✅ Ruta :playerId → :userId
  @Put(':id/callups/:userId')
  updateCallupFlags(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body()
    flags: {
      availableStatus?: 'PENDING' | 'YES' | 'NO'
      calledUpStatus?: 'PENDING' | 'YES' | 'NO'
      confirmedStatus?: 'PENDING' | 'YES' | 'NO'
      notes?: string
    },
  ) {
    return this.matchService.updateCallupFlags(req.user.id, id, targetUserId, flags)
  }

  @Delete(':id/callups/:userId')
  removeCallup(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.matchService.removeCallup(req.user.id, id, targetUserId)
  }

  @Get(':id/candidates')
  getCandidatesFromClub(@Request() req, @Param('id') id: string) {
    return this.matchService.getCandidatesFromClub(req.user.id, id)
  }

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  // ✅ Ruta :playerId → :userId
  @Post(':id/stats/:userId')
  upsertPlayerStats(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() stats: UpdateStatsDto,
  ) {
    return this.matchService.upsertPlayerStats(req.user.id, id, targetUserId, stats)
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
  // ============================================
  // PÁDEL — SUBPARTIDOS (PISTAS)
  // ============================================

  @Post(':id/padel/sub-matches')
  addPadelSubMatch(@Request() req, @Param('id') id: string) {
    return this.matchService.addPadelSubMatch(req.user.id, id)
  }

  @Delete('padel/sub-matches/:subMatchId')
  removePadelSubMatch(@Request() req, @Param('subMatchId') subMatchId: string) {
    return this.matchService.removePadelSubMatch(req.user.id, subMatchId)
  }

  @Put(':id/padel/sub-matches/reorder')
  reorderPadelSubMatches(
    @Request() req,
    @Param('id') id: string,
    @Body('subMatchIds') subMatchIds: string[],
  ) {
    return this.matchService.reorderPadelSubMatches(req.user.id, id, subMatchIds)
  }

  @Put('padel/sub-matches/:subMatchId/player')
  updatePadelSubMatchPlayer(
    @Request() req,
    @Param('subMatchId') subMatchId: string,
    @Body('playerSlot') playerSlot: 1 | 2,
    @Body('userId') targetUserId: string | null,
  ) {
    return this.matchService.updatePadelSubMatchPlayer(
      req.user.id,
      subMatchId,
      playerSlot,
      targetUserId,
    )
  }
  @Post('padel/sub-matches/:subMatchId/sets')
  addSetToSubMatch(
    @Request() req,
    @Param('subMatchId') subMatchId: string,
  ) {
    return this.matchService.addSetToSubMatch(req.user.id, subMatchId)
  }

  @Delete('padel/sub-matches/:subMatchId/sets/last')
  removeLastSetFromSubMatch(
    @Request() req,
    @Param('subMatchId') subMatchId: string,
    @Query('force') force?: string,
  ) {
    return this.matchService.removeLastSetFromSubMatch(
      req.user.id,
      subMatchId,
      force === 'true',
    )
  }
  @Put('padel/sets/:setId')
  updatePadelSet(
    @Request() req,
    @Param('setId') setId: string,
    @Body() data: { homeScore?: number; awayScore?: number; played?: boolean },
  ) {
    return this.matchService.updatePadelSet(req.user.id, setId, data)
  }


}