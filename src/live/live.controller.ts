import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
  NotFoundException, // ✅ AÑADIDO
} from '@nestjs/common'
import { LiveService } from './live.service'
import { AuthGuard } from '../auth/auth.guard'
import { PrismaService } from '../prisma/prisma.service' // ✅ AÑADIDO

@UseGuards(AuthGuard)
@Controller('matches/:matchId/live')
export class LiveController {
  constructor(
    private readonly liveService: LiveService,
    private readonly prisma: PrismaService, // ✅ AÑADIDO
  ) {}

  @Get()
  getInfo(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.getStreamInfo(req.user.id, matchId)
  }

  @Post('enable')
  setEnabled(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.liveService.setStreamingEnabled(req.user.id, matchId, body.enabled)
  }

  @Get('candidates')
  getCandidates(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.getCandidates(req.user.id, matchId)
  }

  @Get('permissions')
  getPermissions(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.getPermissions(req.user.id, matchId)
  }

  @Post('permissions')
  setPermissions(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() body: { permissions: { userId: string; canStream: boolean }[] },
  ) {
    return this.liveService.setPermissions(req.user.id, matchId, body.permissions)
  }

  @Delete('permissions/:userId')
  removePermission(
    @Request() req,
    @Param('matchId') matchId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.liveService.removePermission(req.user.id, matchId, targetUserId)
  }

  @Post('start')
  start(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.startStream(req.user.id, matchId)
  }

  @Post('stop')
  stop(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.stopStream(req.user.id, matchId)
  }

  @Post('join')
  join(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.joinAsViewer(req.user.id, matchId)
  }

  @Post('peer')
  registerPeer(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() body: { peerId: string },
  ) {
    return this.liveService.registerViewerPeer(req.user.id, matchId, body.peerId)
  }

  @Delete('leave')
  leave(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.leave(req.user.id, matchId)
  }

  // ─── SCOREBOARD ───

  @Put('scoreboard/config')
  updateScoreboardConfig(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body()
    body: {
      scoreboardEnabled?: boolean
      clockEnabled?: boolean
      homeTeamName?: string
      awayTeamName?: string
      quarterDuration?: number
      overtimeDuration?: number
      customPeriodLabel?: string
    },
  ) {
    return this.liveService.updateScoreboardConfig(req.user.id, matchId, body)
  }

  @Put('scoreboard/score')
  updateScore(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() body: { homeScore: number; awayScore: number },
  ) {
    return this.liveService.updateScore(
      req.user.id,
      matchId,
      body.homeScore,
      body.awayScore,
    )
  }

  @Put('scoreboard/clock')
  updateClock(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() body: { action: 'play' | 'pause' | 'reset' | 'set'; seconds?: number },
  ) {
    return this.liveService.updateClock(req.user.id, matchId, body.action, body.seconds)
  }

  @Put('scoreboard/custom-period')
  setCustomPeriod(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() body: { value: string },
  ) {
    return this.liveService.setCustomPeriod(req.user.id, matchId, body.value)
  }

  @Put('scoreboard/period')
  nextPeriod(@Request() req, @Param('matchId') matchId: string) {
    return this.liveService.nextPeriod(req.user.id, matchId)
  }

  @Put('scoreboard/period-value')
  setPeriodValue(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() body: { value: string },
  ) {
    return this.liveService.setPeriodValue(req.user.id, matchId, body.value)
  }

  // ✅ NUEVO ENDPOINT: Unirse como espectador
  @Post('join-spectator')
  async joinSpectator(
    @Request() req,
    @Param('matchId') matchId: string,
  ) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } })
    if (!match) throw new NotFoundException('Partido no encontrado')

    await this.prisma.matchViewer.upsert({
      where: { matchId_userId: { matchId, userId: req.user.id } },
      create: { matchId, userId: req.user.id },
      update: {}, 
    })

    return { success: true }
  }
}