// backend/src/live-events/live-events.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  Sse,
  UseGuards,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { AuthGuard } from '../auth/auth.guard'
import { LiveEventsService } from './live-events.service'
import { LiveStatsSseService } from './live-stats-sse.service'
import { CreateMatchEventDto } from './dto/create-match-event.dto'
import { UpdateLiveClockDto } from './dto/update-live-clock.dto'
import { CreateOpponentPlayersDto } from './dto/create-opponent-players.dto'
import { SetOnCourtDto } from './dto/set-on-court.dto'

@UseGuards(AuthGuard)
@Controller('stat-sessions/:id')
export class LiveEventsController {
  constructor(
    private readonly service: LiveEventsService,
    private readonly sseService: LiveStatsSseService,
  ) {}

  // ─── SSE ─────────────────────────────────────────────

  @Sse('live-stream')
  streamEvents(@Param('id') id: string): Observable<any> {
    // NestJS mantiene la conexión abierta y envía los datos del Subject
    return this.sseService.getStream(id)
  }

  // ─── Eventos ─────────────────────────────────────────

  @Post('events')
  createEvent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateMatchEventDto,
  ) {
    return this.service.createEvent(req.user.id, id, dto)
  }

  @Get('events')
  listEvents(@Request() req, @Param('id') id: string) {
    return this.service.listEvents(req.user.id, id)
  }

  @Delete('events/:eventId')
  voidEvent(
    @Request() req,
    @Param('id') id: string,
    @Param('eventId') eventId: string,
  ) {
    return this.service.voidEvent(req.user.id, id, eventId)
  }

  // ─── Reloj / periodo ────────────────────────────────

  @Patch('live')
  updateClock(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateLiveClockDto,
  ) {
    return this.service.updateClock(req.user.id, id, dto)
  }

  // ─── Snapshot agregado ──────────────────────────────

  @Get('live-stats')
  getLiveStats(@Request() req, @Param('id') id: string) {
    return this.service.getLiveStats(req.user.id, id)
  }

  // ─── Jugadores rivales ──────────────────────────────

  @Post('opponent-players')
  createOpponentPlayers(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateOpponentPlayersDto,
  ) {
    return this.service.createOpponentPlayers(req.user.id, id, dto)
  }

  @Delete('opponent-players/:opponentPlayerId')
  removeOpponentPlayer(
    @Request() req,
    @Param('id') id: string,
    @Param('opponentPlayerId') opponentPlayerId: string,
  ) {
    return this.service.removeOpponentPlayer(
      req.user.id,
      id,
      opponentPlayerId,
    )
  }

  // ─── Cerrar sesión y materializar stats ─────────────

  @Post('live/close')
  closeSession(@Request() req, @Param('id') id: string) {
    return this.service.closeSession(req.user.id, id)
  }

  // ─── On court ─────────────────────────────────────────

  @Patch('players/:userId/on-court')
  setOurPlayerOnCourt(
    @Request() req,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: SetOnCourtDto,
  ) {
    return this.service.setOurPlayerOnCourt(req.user.id, id, userId, dto)
  }

  @Patch('opponent-players/:opponentPlayerId/on-court')
  setOpponentPlayerOnCourt(
    @Request() req,
    @Param('id') id: string,
    @Param('opponentPlayerId') opponentPlayerId: string,
    @Body() dto: SetOnCourtDto,
  ) {
    return this.service.setOpponentPlayerOnCourt(
      req.user.id,
      id,
      opponentPlayerId,
      dto,
    )
  }
}