// backend/src/stat-sessions/stat-sessions.service.ts

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, StatSessionType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { assertCanManageLiveStats, canViewTeam } from '../common/access'
import { CreateStatSessionDto } from './dto/create-stat-session.dto'
import { UpdateStatSessionDto } from './dto/update-stat-session.dto'
import { UpdateSessionPlayerStatsDto } from './dto/update-session-player-stats.dto'
import { ListStatSessionsQueryDto } from './dto/list-stat-sessions-query.dto'

const USER_SELECT = {
  id: true,
  name: true,
  lastName: true,
  username: true,
  avatar: true,
  email: true,
  isGhost: true,
} as const

@Injectable()
export class StatSessionsService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────

  async listByTeam(
    userId: string,
    teamId: string,
    query: ListStatSessionsQueryDto,
  ) {
    if (!(await canViewTeam(this.prisma, userId, teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    const where: Prisma.StatSessionWhereInput = { teamId }
    if (query.type) where.type = query.type
    if (query.season) {
      where.OR = [{ match: { season: query.season } }]
    }

    const sessions = await this.prisma.statSession.findMany({
      where,
      orderBy: [{ statDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        match: {
          select: {
            id: true,
            opponent: true,
            date: true,
            location: true,
            teamScore: true,
            opponentScore: true,
            season: true,
            status: true,
          },
        },
        _count: { select: { playerStats: true } },
      },
    })

    const response: any = {
      sessions: sessions.map((s) => this.toSessionSummary(s)),
    }

    if (query.includeMatches === 'true') {
      const matches = await this.prisma.match.findMany({
        where: { teamId },
        orderBy: { date: 'desc' },
        select: {
          id: true,
          opponent: true,
          date: true,
          location: true,
          type: true,
          status: true,
          teamScore: true,
          opponentScore: true,
          season: true,
          _count: { select: { playerStats: true } },
        },
      })

      const sessionMatchIds = new Set(
        sessions.filter((s) => s.matchId).map((s) => s.matchId),
      )

      response.matches = matches.map((m) => ({
        id: m.id,
        opponent: m.opponent,
        date: m.date.toISOString(),
        location: m.location,
        type: m.type,
        status: m.status,
        teamScore: m.teamScore,
        opponentScore: m.opponentScore,
        season: m.season,
        hasStats: sessionMatchIds.has(m.id) || m._count.playerStats > 0,
      }))
    }

    return response
  }

  // ─────────────────────────────────────────────
  // GET
  // ─────────────────────────────────────────────

  async getOne(userId: string, sessionId: string) {
    const session = await this.prisma.statSession.findUnique({
      where: { id: sessionId },
      include: {
        match: true,
        playerStats: {
          include: { user: { select: USER_SELECT } },
          orderBy: { user: { lastName: 'asc' } },
        },
      },
    })
    if (!session) throw new NotFoundException('Estadística no encontrada')
    if (!(await canViewTeam(this.prisma, userId, session.teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }
    return session
  }

  // ─────────────────────────────────────────────
  // CREATE (todas independientes)
  // ─────────────────────────────────────────────

  async create(userId: string, teamId: string, dto: CreateStatSessionDto) {
    await assertCanManageLiveStats(this.prisma, userId, teamId)

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, sport: true },
    })
    if (!team) throw new NotFoundException('Equipo no encontrado')

    if (dto.type === StatSessionType.MATCH_LINKED) {
      throw new BadRequestException(
        'Las sesiones ya no se vinculan a un partido. Todas son independientes.',
      )
    }
    if (!dto.label || !dto.statDate) {
      throw new BadRequestException('label y statDate son obligatorios')
    }

    const session = await this.prisma.statSession.create({
      data: {
        teamId,
        matchId: null,
        type: dto.type,
        label: dto.label,
        statDate: new Date(dto.statDate),
        opponent: dto.opponent ?? null,
        opponentTeamName: dto.opponent ?? null,
        opponentPlayerCount: dto.opponentPlayerCount ?? null,
        teamScore: dto.teamScore ?? null,
        opponentScore: dto.opponentScore ?? null,
        createdById: userId,
      },
    })

    await this.seedPlayersForSession(session.id, teamId, null)

    return this.getOne(userId, session.id)
  }

  private async seedPlayersForSession(
    sessionId: string,
    teamId: string,
    matchId: string | null,
  ) {
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        teamId,
        status: 'ACTIVE',
        roles: { some: { roleRef: { name: 'PLAYER' } } },
      },
      select: { userId: true },
    })

    if (memberships.length === 0) return

    await this.prisma.matchPlayerStats.createMany({
      data: memberships.map((m) => ({
        statSessionId: sessionId,
        matchId,
        userId: m.userId,
      })),
      skipDuplicates: true,
    })
  }

  // ─────────────────────────────────────────────
  // UPDATE HEADER
  // ─────────────────────────────────────────────

  async updateHeader(
    userId: string,
    sessionId: string,
    dto: UpdateStatSessionDto,
  ) {
    const session = await this.prisma.statSession.findUnique({
      where: { id: sessionId },
      include: { match: { select: { id: true } } },
    })
    if (!session) throw new NotFoundException('Estadística no encontrada')
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)

    const data: Prisma.StatSessionUpdateInput = {}
    if (dto.label !== undefined) data.label = dto.label
    if (dto.statDate !== undefined) data.statDate = new Date(dto.statDate)
    if (dto.opponent !== undefined) data.opponent = dto.opponent
    if (dto.teamScore !== undefined) data.teamScore = dto.teamScore
    if (dto.opponentScore !== undefined)
      data.opponentScore = dto.opponentScore

    await this.prisma.statSession.update({ where: { id: sessionId }, data })

    return this.getOne(userId, sessionId)
  }

  // ─────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────

  async remove(userId: string, sessionId: string) {
    const session = await this.prisma.statSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teamId: true },
    })
    if (!session) throw new NotFoundException('Estadística no encontrada')
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)

    await this.prisma.statSession.delete({ where: { id: sessionId } })
    return { ok: true }
  }

  // ─────────────────────────────────────────────
  // PLAYERS
  // ─────────────────────────────────────────────

  async addPlayer(userId: string, sessionId: string, targetUserId: string) {
    const session = await this.prisma.statSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teamId: true, matchId: true },
    })
    if (!session) throw new NotFoundException('Estadística no encontrada')
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, deletedAt: true },
    })
    if (!target || target.deletedAt) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const existing = await this.prisma.matchPlayerStats.findUnique({
      where: {
        statSessionId_userId: {
          statSessionId: sessionId,
          userId: targetUserId,
        },
      },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictException('El jugador ya está en esta estadística')
    }

    await this.prisma.matchPlayerStats.create({
      data: {
        statSessionId: sessionId,
        matchId: session.matchId,
        userId: targetUserId,
      },
    })

    return this.getOne(userId, sessionId)
  }

  async removePlayer(
    userId: string,
    sessionId: string,
    targetUserId: string,
  ) {
    const session = await this.prisma.statSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teamId: true },
    })
    if (!session) throw new NotFoundException('Estadística no encontrada')
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)

    await this.prisma.matchPlayerStats.deleteMany({
      where: { statSessionId: sessionId, userId: targetUserId },
    })

    return this.getOne(userId, sessionId)
  }

  // ─────────────────────────────────────────────
  // PLAYER STATS
  // ─────────────────────────────────────────────

  async updatePlayerStats(
    userId: string,
    sessionId: string,
    targetUserId: string,
    dto: UpdateSessionPlayerStatsDto,
  ) {
    const session = await this.prisma.statSession.findUnique({
      where: { id: sessionId },
      select: { id: true, teamId: true, matchId: true, type: true },
    })
    if (!session) throw new NotFoundException('Estadística no encontrada')
    await assertCanManageLiveStats(this.prisma, userId, session.teamId)

    if (
      dto.seconds !== undefined &&
      (dto.seconds < 0 || dto.seconds > 59)
    ) {
      throw new BadRequestException('seconds debe estar entre 0 y 59')
    }

    const data: Prisma.MatchPlayerStatsUpdateInput = {}
    const fields: (keyof UpdateSessionPlayerStatsDto)[] = [
      'minutes',
      'seconds',
      'points',
      'rebounds',
      'assists',
      'steals',
      'blocks',
      'turnovers',
      'fouls',
      'blocksAgainst',
      'foulsDrawn',
      'plusMinus',
      'fieldGoalsMade',
      'fieldGoalsAttempted',
      'threePointersMade',
      'threePointersAttempted',
      'freeThrowsMade',
      'freeThrowsAttempted',
    ]
    for (const f of fields) {
      const v = dto[f]
      if (v !== undefined) (data as any)[f] = v
    }

    return this.prisma.matchPlayerStats.update({
      where: {
        statSessionId_userId: {
          statSessionId: sessionId,
          userId: targetUserId,
        },
      },
      data,
    })
  }

  // ─────────────────────────────────────────────
  // CANDIDATOS
  // ─────────────────────────────────────────────

  async getCandidates(userId: string, sessionId: string) {
    const session = await this.prisma.statSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        teamId: true,
        team: { select: { clubId: true, sport: true } },
      },
    })
    if (!session) throw new NotFoundException('Estadística no encontrada')
    if (!(await canViewTeam(this.prisma, userId, session.teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    const existing = await this.prisma.matchPlayerStats.findMany({
      where: { statSessionId: sessionId },
      select: { userId: true },
    })
    const excludeIds = existing.map((e) => e.userId)

    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        roles: { some: { roleRef: { name: 'PLAYER' } } },
        status: 'ACTIVE',
        team: {
          clubId: session.team.clubId,
          sport: session.team.sport,
          id: { not: session.teamId },
        },
        userId: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
      },
      include: {
        user: { select: USER_SELECT },
        team: {
          select: { id: true, name: true, category: true, sport: true },
        },
      },
      orderBy: [{ team: { name: 'asc' } }, { user: { lastName: 'asc' } }],
    })

    return memberships.map((m) => ({
      id: m.user.id,
      userId: m.user.id,
      name: m.user.name,
      lastName: m.user.lastName,
      username: m.user.username,
      avatar: m.user.avatar,
      isGhost: m.user.isGhost,
      number: m.jerseyNumber,
      position: m.position,
      teamId: m.team.id,
      team: {
        id: m.team.id,
        name: m.team.name,
        category: m.team.category,
        sport: m.team.sport,
      },
    }))
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private toSessionSummary(s: {
    id: string
    teamId: string
    matchId: string | null
    type: StatSessionType
    label: string
    statDate: Date
    opponent: string | null
    teamScore: number | null
    opponentScore: number | null
    createdAt: Date
    match: {
      id: string
      opponent: string
      date: Date
      location: string
      teamScore: number | null
      opponentScore: number | null
      season: string | null
      status: string
    } | null
    _count: { playerStats: number }
  }) {
    return {
      id: s.id,
      teamId: s.teamId,
      matchId: s.matchId,
      type: s.type,
      label: s.label,
      statDate: s.statDate.toISOString(),
      opponent: s.opponent,
      teamScore: s.match?.teamScore ?? s.teamScore,
      opponentScore: s.match?.opponentScore ?? s.opponentScore,
      playerCount: s._count.playerStats,
      match: s.match
        ? {
            id: s.match.id,
            opponent: s.match.opponent,
            date: s.match.date.toISOString(),
            location: s.match.location,
            season: s.match.season,
            status: s.match.status,
          }
        : null,
      createdAt: s.createdAt.toISOString(),
    }
  }
}