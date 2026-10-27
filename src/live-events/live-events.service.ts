// backend/src/live-events/live-events.service.ts

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { MatchEventType, Prisma, StatSessionType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { assertCanManageLiveStats, canViewTeam } from '../common/access'
import { CreateMatchEventDto } from './dto/create-match-event.dto'
import { UpdateLiveClockDto } from './dto/update-live-clock.dto'
import { CreateOpponentPlayersDto } from './dto/create-opponent-players.dto'
import { SetOnCourtDto } from './dto/set-on-court.dto'
import { LiveStatsSseService } from './live-stats-sse.service' // <-- IMPORTANTE

const USER_SELECT = {
  id: true,
  name: true,
  lastName: true,
  username: true,
  avatar: true,
  isGhost: true,
} as const

const POINT_VALUES: Partial<Record<MatchEventType, number>> = {
  POINTS_2: 2,
  POINTS_3: 3,
  FREE_THROW: 1,
}

@Injectable()
export class LiveEventsService {
  constructor(
    private prisma: PrismaService,
    private sseService: LiveStatsSseService, // <-- IMPORTANTE
  ) {}

  // ─────────────────────────────────────────────
  // EVENTOS
  // ─────────────────────────────────────────────

  async createEvent(
    userId: string,
    sessionId: string,
    dto: CreateMatchEventDto,
  ) {
    const session = await this.getSessionOrThrow(sessionId)
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)
    this.assertSessionOpen(session)

    const hasPlayer = !!dto.playerId
    const hasOpponent = !!dto.opponentPlayerId
    if (hasPlayer === hasOpponent) {
      throw new BadRequestException(
        'Debes indicar playerId o opponentPlayerId (uno y solo uno)',
      )
    }

    if (hasPlayer) {
      const ps = await this.prisma.matchPlayerStats.findFirst({
        where: { statSessionId: sessionId, userId: dto.playerId },
        select: { id: true },
      })
      if (!ps) {
        throw new BadRequestException(
          'El jugador no pertenece a esta estadística',
        )
      }
    } else {
      const op = await this.prisma.opponentPlayer.findFirst({
        where: { id: dto.opponentPlayerId, statSessionId: sessionId },
        select: { id: true },
      })
      if (!op) {
        throw new BadRequestException(
          'El jugador rival no pertenece a esta estadística',
        )
      }
    }

    await this.prisma.matchEvent.create({
      data: {
        matchId: session.matchId,
        statSessionId: sessionId,
        playerId: dto.playerId ?? null,
        opponentPlayerId: dto.opponentPlayerId ?? null,
        isOpponent: hasOpponent,
        type: dto.type,
        period: session.currentPeriod,
        clockSeconds: await this.resolveCurrentClockSeconds(session),
        createdById: userId,
      },
    })

    const stats = await this.getLiveStats(userId, sessionId)
    this.sseService.emit(sessionId, stats) // <-- EMITIR SSE
    return stats
  }

  async voidEvent(userId: string, sessionId: string, eventId: string) {
    const session = await this.getSessionOrThrow(sessionId)
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)

    const event = await this.prisma.matchEvent.findUnique({
      where: { id: eventId },
      select: { id: true, statSessionId: true, voidedAt: true },
    })
    if (!event || event.statSessionId !== sessionId) {
      throw new NotFoundException('Evento no encontrado')
    }
    if (event.voidedAt) {
      return this.getLiveStats(userId, sessionId)
    }

    await this.prisma.matchEvent.update({
      where: { id: eventId },
      data: { voidedAt: new Date(), voidedById: userId },
    })

    const stats = await this.getLiveStats(userId, sessionId)
    this.sseService.emit(sessionId, stats) // <-- EMITIR SSE
    return stats
  }

  async listEvents(userId: string, sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId)
    if (!(await canViewTeam(this.prisma, userId, session.teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return this.prisma.matchEvent.findMany({
      where: { statSessionId: sessionId },
      orderBy: { createdAt: 'desc' },
      include: {
        player: { select: USER_SELECT },
        opponentPlayer: {
          select: { id: true, number: true, name: true },
        },
      },
    })
  }

  // ─────────────────────────────────────────────
  // RELOJ / PERIODO
  // ─────────────────────────────────────────────

  async updateClock(
    userId: string,
    sessionId: string,
    dto: UpdateLiveClockDto,
  ) {
    const session = await this.getSessionOrThrow(sessionId)
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)
    this.assertSessionOpen(session)

    // Regla: no se puede cambiar de periodo con el reloj corriendo
    if (
      dto.currentPeriod !== undefined &&
      dto.currentPeriod !== session.currentPeriod &&
      session.clockRunning
    ) {
      throw new ConflictException(
        'Para cambiar de cuarto, primero para el reloj',
      )
    }

    const data: Prisma.StatSessionUpdateInput = {}

    if (dto.clockSeconds !== undefined) data.clockSeconds = dto.clockSeconds
    if (dto.currentPeriod !== undefined) data.currentPeriod = dto.currentPeriod

    if (dto.clockRunning !== undefined) {
      data.clockRunning = dto.clockRunning
      if (dto.clockRunning && !session.clockRunning) {
        data.clockStartedAt = new Date()
      } else if (!dto.clockRunning) {
        if (session.clockRunning && session.clockStartedAt) {
          const elapsed = Math.floor(
            (Date.now() - session.clockStartedAt.getTime()) / 1000,
          )
          const newSeconds = Math.max(0, session.clockSeconds - elapsed)
          if (dto.clockSeconds === undefined) {
            data.clockSeconds = newSeconds
          }
        }
        data.clockStartedAt = null
      }
    }

    await this.prisma.statSession.update({
      where: { id: sessionId },
      data,
    })

    const stats = await this.getLiveStats(userId, sessionId)
    this.sseService.emit(sessionId, stats) // <-- EMITIR SSE
    return stats
  }

  // ─────────────────────────────────────────────
  // LIVE STATS (agregación)
  // ─────────────────────────────────────────────

  async getLiveStats(viewerId: string, sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId)
    if (!(await canViewTeam(this.prisma, viewerId, session.teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    const [events, ourPlayers, opponentPlayers, openIntervals] =
      await Promise.all([
        this.prisma.matchEvent.findMany({
          where: { statSessionId: sessionId, voidedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            player: { select: USER_SELECT },
            opponentPlayer: {
              select: { id: true, number: true, name: true },
            },
          },
        }),
        this.prisma.matchPlayerStats.findMany({
          where: { statSessionId: sessionId },
          include: { user: { select: USER_SELECT } },
          orderBy: { user: { lastName: 'asc' } },
        }),
        this.prisma.opponentPlayer.findMany({
          where: { statSessionId: sessionId },
          orderBy: { number: 'asc' },
        }),
        this.prisma.statSessionOnCourt.findMany({
          where: { statSessionId: sessionId, clockSecondsEnd: null },
          select: { userId: true, opponentPlayerId: true },
        }),
      ])

    type Agg = {
      points: number
      twoPointersMade: number
      twoPointersAttempted: number
      threePointersMade: number
      threePointersAttempted: number
      freeThrowsMade: number
      freeThrowsAttempted: number
      reboundsOff: number
      reboundsDef: number
      rebounds: number
      assists: number
      steals: number
      blocks: number
      turnovers: number
      fouls: number
    }

    const emptyAgg = (): Agg => ({
      points: 0,
      twoPointersMade: 0,
      twoPointersAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      reboundsOff: 0,
      reboundsDef: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
    })

    const ourAgg = new Map<string, Agg>()
    const oppAgg = new Map<string, Agg>()

    let teamScore = 0
    let opponentScore = 0

    for (const ev of events) {
      const agg = ev.isOpponent
        ? oppAgg.get(ev.opponentPlayerId!) ?? emptyAgg()
        : ourAgg.get(ev.playerId!) ?? emptyAgg()

      const points = POINT_VALUES[ev.type] ?? 0
      agg.points += points
      if (ev.isOpponent) opponentScore += points
      else teamScore += points

      switch (ev.type) {
        case 'REBOUND_OFF':
          agg.reboundsOff += 1
          agg.rebounds += 1
          break
        case 'REBOUND_DEF':
          agg.reboundsDef += 1
          agg.rebounds += 1
          break
        case 'ASSIST':
          agg.assists += 1
          break
        case 'STEAL':
          agg.steals += 1
          break
        case 'BLOCK':
          agg.blocks += 1
          break
        case 'TURNOVER':
          agg.turnovers += 1
          break
        case 'FOUL':
          agg.fouls += 1
          break
        case 'POINTS_2':
          agg.twoPointersMade += 1
          agg.twoPointersAttempted += 1
          break
        case 'POINTS_3':
          agg.threePointersMade += 1
          agg.threePointersAttempted += 1
          break
        case 'FREE_THROW':
          agg.freeThrowsMade += 1
          agg.freeThrowsAttempted += 1
          break
        case 'MISS_2':
          agg.twoPointersAttempted += 1
          break
        case 'MISS_3':
          agg.threePointersAttempted += 1
          break
        case 'MISS_FT':
          agg.freeThrowsAttempted += 1
          break
      }

      if (ev.isOpponent) oppAgg.set(ev.opponentPlayerId!, agg)
      else ourAgg.set(ev.playerId!, agg)
    }

    const openUsers = new Set(
      openIntervals.map((o) => o.userId).filter(Boolean) as string[],
    )
    const openOpps = new Set(
      openIntervals
        .map((o) => o.opponentPlayerId)
        .filter(Boolean) as string[],
    )

    const currentClock = await this.resolveCurrentClockSeconds(session)

    const players = await Promise.all(
      ourPlayers.map(async (ps) => {
        const agg = ourAgg.get(ps.userId) ?? emptyAgg()
        const fgm = agg.twoPointersMade + agg.threePointersMade
        const fga =
          agg.twoPointersAttempted + agg.threePointersAttempted
        return {
          userId: ps.userId,
          user: ps.user,
          isOpponent: false,
          points: agg.points,
          twoPointersMade: agg.twoPointersMade,
          twoPointersAttempted: agg.twoPointersAttempted,
          fieldGoalsMade: fgm,
          fieldGoalsAttempted: fga,
          threePointersMade: agg.threePointersMade,
          threePointersAttempted: agg.threePointersAttempted,
          freeThrowsMade: agg.freeThrowsMade,
          freeThrowsAttempted: agg.freeThrowsAttempted,
          rebounds: agg.rebounds,
          reboundsOff: agg.reboundsOff,
          reboundsDef: agg.reboundsDef,
          assists: agg.assists,
          steals: agg.steals,
          blocks: agg.blocks,
          turnovers: agg.turnovers,
          fouls: agg.fouls,
          onCourt: openUsers.has(ps.userId),
          secondsPlayed: await this.computeSecondsPlayed(
            session,
            { userId: ps.userId },
            currentClock,
          ),
        }
      }),
    )

    const opponentPlayersOut = await Promise.all(
      opponentPlayers.map(async (op) => {
        const agg = oppAgg.get(op.id) ?? emptyAgg()
        const fgm = agg.twoPointersMade + agg.threePointersMade
        const fga =
          agg.twoPointersAttempted + agg.threePointersAttempted
        return {
          opponentPlayerId: op.id,
          number: op.number,
          name: op.name,
          userId: op.userId,
          points: agg.points,
          twoPointersMade: agg.twoPointersMade,
          twoPointersAttempted: agg.twoPointersAttempted,
          fieldGoalsMade: fgm,
          fieldGoalsAttempted: fga,
          threePointersMade: agg.threePointersMade,
          threePointersAttempted: agg.threePointersAttempted,
          freeThrowsMade: agg.freeThrowsMade,
          freeThrowsAttempted: agg.freeThrowsAttempted,
          rebounds: agg.rebounds,
          reboundsOff: agg.reboundsOff,
          reboundsDef: agg.reboundsDef,
          assists: agg.assists,
          steals: agg.steals,
          blocks: agg.blocks,
          turnovers: agg.turnovers,
          fouls: agg.fouls,
          onCourt: openOpps.has(op.id),
          secondsPlayed: await this.computeSecondsPlayed(
            session,
            { opponentPlayerId: op.id },
            currentClock,
          ),
        }
      }),
    )

    return {
      session: {
        id: session.id,
        label: session.label,
        teamId: session.teamId,
        matchId: session.matchId,
        type: session.type,
        statDate: session.statDate.toISOString(),
        closedAt: session.closedAt?.toISOString() ?? null,
      },
      clock: {
        seconds: currentClock,
        running: session.clockRunning,
        currentPeriod: session.currentPeriod,
        periodCount: session.periodCount,
        quarterDuration: session.quarterDuration,
      },
      score: {
        team: teamScore,
        opponent: opponentScore,
      },
      players,
      opponentPlayers: opponentPlayersOut,
      events: events.map((ev) => ({
        id: ev.id,
        type: ev.type,
        createdAt: ev.createdAt.toISOString(),
        period: ev.period,
        clockSeconds: ev.clockSeconds,
        isOpponent: ev.isOpponent,
        player: ev.player,
        opponentPlayer: ev.opponentPlayer,
      })),
    }
  }

  // ─────────────────────────────────────────────
  // JUGADORES RIVALES
  // ─────────────────────────────────────────────

  async createOpponentPlayers(
    userId: string,
    sessionId: string,
    dto: CreateOpponentPlayersDto,
  ) {
    const session = await this.getSessionOrThrow(sessionId)
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)
    this.assertSessionOpen(session)

    const numbers = dto.players.map((p) => p.number)
    const dup = numbers.find((n, i) => numbers.indexOf(n) !== i)
    if (dup !== undefined) {
      throw new BadRequestException(`Número de jugador duplicado: ${dup}`)
    }

    const existing = await this.prisma.opponentPlayer.findMany({
      where: { statSessionId: sessionId },
      select: { number: true },
    })
    const existingNums = new Set(existing.map((e) => e.number))
    for (const n of numbers) {
      if (existingNums.has(n)) {
        throw new ConflictException(
          `Ya existe un jugador rival con el número ${n}`,
        )
      }
    }

    for (const p of dto.players) {
      if (!p.userId) continue
      const userExists = await this.prisma.user.findUnique({
        where: { id: p.userId },
        select: { id: true, deletedAt: true },
      })
      if (!userExists || userExists.deletedAt) {
        throw new BadRequestException(`El usuario ${p.userId} no existe`)
      }
      const clash = await this.prisma.matchPlayerStats.findFirst({
        where: { statSessionId: sessionId, userId: p.userId },
        select: { id: true },
      })
      if (clash) {
        throw new BadRequestException(
          `El jugador ${p.userId} ya está en el equipo local de esta estadística`,
        )
      }
    }

    await this.prisma.opponentPlayer.createMany({
      data: dto.players.map((p) => ({
        statSessionId: sessionId,
        number: p.number,
        name: p.name ?? null,
        position: p.position ?? null,
        userId: p.userId ?? null,
      })),
    })

    const stats = await this.getLiveStats(userId, sessionId)
    this.sseService.emit(sessionId, stats) // <-- EMITIR SSE
    return stats
  }

  async removeOpponentPlayer(
    userId: string,
    sessionId: string,
    opponentPlayerId: string,
  ) {
    const session = await this.getSessionOrThrow(sessionId)
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)
    this.assertSessionOpen(session)

    const op = await this.prisma.opponentPlayer.findUnique({
      where: { id: opponentPlayerId },
      select: { id: true, statSessionId: true },
    })
    if (!op || op.statSessionId !== sessionId) {
      throw new NotFoundException('Jugador rival no encontrado')
    }

    await this.prisma.opponentPlayer.delete({ where: { id: op.id } })

    const stats = await this.getLiveStats(userId, sessionId)
    this.sseService.emit(sessionId, stats) // <-- EMITIR SSE
    return stats
  }

  // ─────────────────────────────────────────────
  // ON COURT
  // ─────────────────────────────────────────────

  async setOurPlayerOnCourt(
    userId: string,
    sessionId: string,
    targetUserId: string,
    dto: SetOnCourtDto,
  ) {
    const session = await this.getSessionOrThrow(sessionId)
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)
    this.assertSessionOpen(session)

    const ps = await this.prisma.matchPlayerStats.findFirst({
      where: { statSessionId: sessionId, userId: targetUserId },
      select: { id: true },
    })
    if (!ps) {
      throw new BadRequestException(
        'El jugador no pertenece a esta estadística',
      )
    }

    await this.setPlayerOnCourt(
      session,
      { userId: targetUserId },
      dto.onCourt,
    )
    const stats = await this.getLiveStats(userId, sessionId)
    this.sseService.emit(sessionId, stats) // <-- EMITIR SSE
    return stats
  }

  async setOpponentPlayerOnCourt(
    userId: string,
    sessionId: string,
    opponentPlayerId: string,
    dto: SetOnCourtDto,
  ) {
    const session = await this.getSessionOrThrow(sessionId)
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)
    this.assertSessionOpen(session)

    const op = await this.prisma.opponentPlayer.findFirst({
      where: { id: opponentPlayerId, statSessionId: sessionId },
      select: { id: true },
    })
    if (!op) {
      throw new BadRequestException(
        'El jugador rival no pertenece a esta estadística',
      )
    }

    await this.setPlayerOnCourt(
      session,
      { opponentPlayerId },
      dto.onCourt,
    )
    const stats = await this.getLiveStats(userId, sessionId)
    this.sseService.emit(sessionId, stats) // <-- EMITIR SSE
    return stats
  }

  private async setPlayerOnCourt(
    session: {
      id: string
      clockSeconds: number
      clockRunning: boolean
      clockStartedAt: Date | null
    },
    who: { userId: string } | { opponentPlayerId: string },
    onCourt: boolean,
  ) {
    // Regla: cambios solo con el reloj parado
    if (session.clockRunning) {
      throw new ConflictException(
        'Para hacer cambios, primero para el reloj',
      )
    }

    const statSessionId = session.id
    const currentClock = await this.resolveCurrentClockSeconds(session)

    // Si va a ENTRAR, contar cuántos hay en pista del mismo bando
    if (onCourt) {
      const isOur = 'userId' in who
      const countOnCourt = await this.prisma.statSessionOnCourt.count({
        where: {
          statSessionId,
          clockSecondsEnd: null,
          ...(isOur ? { userId: { not: null } } : { opponentPlayerId: { not: null } }),
        },
      })
      if (countOnCourt >= 5) {
        throw new ConflictException(
          'Ya hay 5 jugadores en pista. Saca a uno antes de meter a otro.',
        )
      }
    }

    const where =
      'userId' in who
        ? { statSessionId, userId: who.userId, clockSecondsEnd: null }
        : {
            statSessionId,
            opponentPlayerId: who.opponentPlayerId,
            clockSecondsEnd: null,
          }

    if (onCourt) {
      const open = await this.prisma.statSessionOnCourt.findFirst({
        where,
        select: { id: true },
      })
      if (open) return

      await this.prisma.statSessionOnCourt.create({
        data: {
          statSessionId,
          ...('userId' in who
            ? { userId: who.userId }
            : { opponentPlayerId: who.opponentPlayerId }),
          enteredAt: new Date(),
          clockSecondsStart: currentClock,
          clockSecondsEnd: null,
        },
      })
    } else {
      const open = await this.prisma.statSessionOnCourt.findFirst({
        where,
        select: { id: true, clockSecondsStart: true },
      })
      if (!open) return
      await this.prisma.statSessionOnCourt.update({
        where: { id: open.id },
        data: {
          exitedAt: new Date(),
          clockSecondsEnd: currentClock,
        },
      })
    }
  }

  private async computeSecondsPlayed(
    session: {
      id: string
      clockSeconds: number
      clockRunning: boolean
      clockStartedAt: Date | null
    },
    who: { userId: string } | { opponentPlayerId: string },
    currentClockOverride?: number,
  ): Promise<number> {
    const where =
      'userId' in who
        ? { statSessionId: session.id, userId: who.userId }
        : { statSessionId: session.id, opponentPlayerId: who.opponentPlayerId }

    const intervals = await this.prisma.statSessionOnCourt.findMany({
      where,
      select: { clockSecondsStart: true, clockSecondsEnd: true },
    })

    const nowClock =
      currentClockOverride ??
      (await this.resolveCurrentClockSeconds(session))

    let total = 0
    for (const it of intervals) {
      const start = it.clockSecondsStart
      const end = it.clockSecondsEnd ?? nowClock
      if (start != null && end != null && start > end) {
        total += start - end
      }
    }
    return total
  }

  // ─────────────────────────────────────────────
  // CERRAR SESIÓN Y MATERIALIZAR STATS
  // ─────────────────────────────────────────────

  async closeSession(userId: string, sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId)
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)

    if (session.closedAt) {
      return this.getLiveStats(userId, sessionId)
    }

    // Cerrar intervalos abiertos con el clock actual
    const currentClock = await this.resolveCurrentClockSeconds(session)
    await this.prisma.statSessionOnCourt.updateMany({
      where: { statSessionId: sessionId, clockSecondsEnd: null },
      data: {
        exitedAt: new Date(),
        clockSecondsEnd: currentClock,
      },
    })

    const events = await this.prisma.matchEvent.findMany({
      where: { statSessionId: sessionId, voidedAt: null },
      select: {
        playerId: true,
        opponentPlayerId: true,
        isOpponent: true,
        type: true,
      },
    })

    type Agg = {
      points: number
      twoPointersMade: number
      twoPointersAttempted: number
      threePointersMade: number
      threePointersAttempted: number
      freeThrowsMade: number
      freeThrowsAttempted: number
      rebounds: number
      reboundsOff: number
      reboundsDef: number
      assists: number
      steals: number
      blocks: number
      turnovers: number
      fouls: number
    }

    const emptyAgg = (): Agg => ({
      points: 0,
      twoPointersMade: 0,
      twoPointersAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      rebounds: 0,
      reboundsOff: 0,
      reboundsDef: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
    })

    const ourAgg = new Map<string, Agg>()
    const oppAgg = new Map<string, Agg>()

    for (const ev of events) {
      const agg = ev.isOpponent
        ? oppAgg.get(ev.opponentPlayerId!) ?? emptyAgg()
        : ourAgg.get(ev.playerId!) ?? emptyAgg()

      const points = POINT_VALUES[ev.type] ?? 0
      agg.points += points

      switch (ev.type) {
        case 'REBOUND_OFF':
          agg.reboundsOff += 1
          agg.rebounds += 1
          break
        case 'REBOUND_DEF':
          agg.reboundsDef += 1
          agg.rebounds += 1
          break
        case 'ASSIST':
          agg.assists += 1
          break
        case 'STEAL':
          agg.steals += 1
          break
        case 'BLOCK':
          agg.blocks += 1
          break
        case 'TURNOVER':
          agg.turnovers += 1
          break
        case 'FOUL':
          agg.fouls += 1
          break
        case 'POINTS_2':
          agg.twoPointersMade += 1
          agg.twoPointersAttempted += 1
          break
        case 'POINTS_3':
          agg.threePointersMade += 1
          agg.threePointersAttempted += 1
          break
        case 'FREE_THROW':
          agg.freeThrowsMade += 1
          agg.freeThrowsAttempted += 1
          break
        case 'MISS_2':
          agg.twoPointersAttempted += 1
          break
        case 'MISS_3':
          agg.threePointersAttempted += 1
          break
        case 'MISS_FT':
          agg.freeThrowsAttempted += 1
          break
      }

      if (ev.isOpponent) oppAgg.set(ev.opponentPlayerId!, agg)
      else ourAgg.set(ev.playerId!, agg)
    }

    const ourPlayers = await this.prisma.matchPlayerStats.findMany({
      where: { statSessionId: sessionId },
      select: { id: true, userId: true },
    })

    const oppPlayers = await this.prisma.opponentPlayer.findMany({
      where: { statSessionId: sessionId },
      select: { id: true },
    })

    await this.prisma.$transaction(async (tx) => {
      for (const ps of ourPlayers) {
        const agg = ourAgg.get(ps.userId) ?? emptyAgg()
        const totalSecs = await this.computeSecondsPlayed(
          session,
          { userId: ps.userId },
          currentClock,
        )
        const fgm = agg.twoPointersMade + agg.threePointersMade
        const fga =
          agg.twoPointersAttempted + agg.threePointersAttempted
        await tx.matchPlayerStats.update({
          where: { id: ps.id },
          data: {
            points: agg.points,
            twoPointersMade: agg.twoPointersMade,
            twoPointersAttempted: agg.twoPointersAttempted,
            fieldGoalsMade: fgm,
            fieldGoalsAttempted: fga,
            threePointersMade: agg.threePointersMade,
            threePointersAttempted: agg.threePointersAttempted,
            freeThrowsMade: agg.freeThrowsMade,
            freeThrowsAttempted: agg.freeThrowsAttempted,
            rebounds: agg.rebounds,
            reboundsOff: agg.reboundsOff,
            reboundsDef: agg.reboundsDef,
            assists: agg.assists,
            steals: agg.steals,
            blocks: agg.blocks,
            turnovers: agg.turnovers,
            fouls: agg.fouls,
            minutes: Math.floor(totalSecs / 60),
            seconds: totalSecs % 60,
          },
        })
      }

      for (const op of oppPlayers) {
        const agg = oppAgg.get(op.id) ?? emptyAgg()
        const totalSecs = await this.computeSecondsPlayed(
          session,
          { opponentPlayerId: op.id },
          currentClock,
        )
        const fgm = agg.twoPointersMade + agg.threePointersMade
        const fga =
          agg.twoPointersAttempted + agg.threePointersAttempted
        const payload = {
          points: agg.points,
          twoPointersMade: agg.twoPointersMade,
          twoPointersAttempted: agg.twoPointersAttempted,
          fieldGoalsMade: fgm,
          fieldGoalsAttempted: fga,
          threePointersMade: agg.threePointersMade,
          threePointersAttempted: agg.threePointersAttempted,
          freeThrowsMade: agg.freeThrowsMade,
          freeThrowsAttempted: agg.freeThrowsAttempted,
          rebounds: agg.rebounds,
          reboundsOff: agg.reboundsOff,
          reboundsDef: agg.reboundsDef,
          assists: agg.assists,
          steals: agg.steals,
          blocks: agg.blocks,
          turnovers: agg.turnovers,
          fouls: agg.fouls,
          minutes: Math.floor(totalSecs / 60),
          seconds: totalSecs % 60,
        }
        await tx.opponentPlayerStats.upsert({
          where: { opponentPlayerId: op.id },
          update: payload,
          create: { opponentPlayerId: op.id, ...payload },
        })
      }

      await tx.statSession.update({
        where: { id: sessionId },
        data: { closedAt: new Date() },
      })
    })

    const stats = await this.getLiveStats(userId, sessionId)
    this.sseService.emit(sessionId, stats) // <-- EMITIR SSE
    return stats
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private async getSessionOrThrow(sessionId: string) {
    const session = await this.prisma.statSession.findUnique({
      where: { id: sessionId },
    })
    if (!session) throw new NotFoundException('Estadística no encontrada')
    return session
  }

  private assertSessionOpen(session: { closedAt: Date | null }) {
    if (session.closedAt) {
      throw new ConflictException(
        'Esta estadística ya está cerrada. No se pueden añadir eventos.',
      )
    }
  }

  private async resolveCurrentClockSeconds(session: {
    clockSeconds: number
    clockRunning: boolean
    clockStartedAt: Date | null
  }): Promise<number> {
    if (!session.clockRunning || !session.clockStartedAt) {
      return session.clockSeconds
    }
    const elapsed = Math.floor(
      (Date.now() - session.clockStartedAt.getTime()) / 1000,
    )
    return Math.max(0, session.clockSeconds - elapsed)
  }
}