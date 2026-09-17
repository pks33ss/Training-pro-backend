import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { LiveService } from './live.service'
import { AuthGuard } from '../auth/auth.guard'

@ApiTags('live')
@ApiBearerAuth('access-token')
@Controller('matches/:matchId/live')
@UseGuards(AuthGuard)
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  // ============================================
  // INFO Y CANDIDATOS
  // ============================================

  @Get()
  getInfo(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.getStreamInfo(req.user.id, matchId)
  }

  @Get('candidates')
  getCandidates(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.getCandidates(req.user.id, matchId)
  }

  @Get('permissions')
  getPermissions(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.getPermissions(req.user.id, matchId)
  }

  @Post('enable')
  setEnabled(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body('enabled') enabled: boolean,
  ) {
    return this.liveService.setStreamingEnabled(req.user.id, matchId, enabled)
  }

  @Post('permissions')
  setPermissions(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body('permissions') permissions: { userId: string; canStream: boolean }[],
  ) {
    return this.liveService.setPermissions(req.user.id, matchId, permissions)
  }

  @Delete('permissions/:userId')
  removePermission(
    @Request() req,
    @Param('matchId') matchId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.liveService.removePermission(req.user.id, matchId, targetUserId)
  }

  // ============================================
  // START / STOP
  // ============================================

  @Post('start')
  start(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.startStream(req.user.id, matchId)
  }

  @Post('stop')
  stop(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.stopStream(req.user.id, matchId)
  }

  // ============================================
  // SCOREBOARD
  // ============================================

  @Put('scoreboard/config')
  updateConfig(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() config: any,
  ) {
    return this.liveService.updateScoreboardConfig(req.user.id, matchId, config)
  }

  @Put('scoreboard/score')
  updateScore(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body('homeScore') homeScore: number,
    @Body('awayScore') awayScore: number,
  ) {
    return this.liveService.updateScore(req.user.id, matchId, homeScore, awayScore)
  }

  @Put('scoreboard/clock')
  updateClock(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body('action') action: 'play' | 'pause' | 'reset' | 'set',
    @Body('seconds') seconds?: number,
  ) {
    return this.liveService.updateClock(req.user.id, matchId, action, seconds)
  }

  @Put('scoreboard/period')
  nextPeriod(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.nextPeriod(req.user.id, matchId)
  }

  // ============================================
  // VIEWERS
  // ============================================

  @Post('join')
  join(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.joinAsViewer(req.user.id, matchId)
  }

  @Post('peer')
  registerPeer(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body('peerId') peerId: string,
  ) {
    return this.liveService.registerViewerPeer(req.user.id, matchId, peerId)
  }

  @Delete('leave')
  leave(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.leave(req.user.id, matchId)
  }
}