// backend/src/match/match.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMatchDto } from './dto/create-match.dto'
import { UpdateMatchDto } from './dto/update-match.dto'
import { UpdateResultDto } from './dto/update-result.dto'
import { UpdateStatsDto } from './dto/update-stats.dto'
import {
  getTeamForViewer,
  resolveViewerStatsRole,
  canViewTeam,
} from '../common/access'
import { computePadelStatsFromMatch } from '../stats/padel-stats.helper'
import { computeBasketballStatsFromMatch } from '../stats/basketball-stats.helper'
import { buildVisibleKeys, filterStatsPayload } from '../stats/stats-filter'
import { normalizeMembershipRolesList } from '../common/serialize'

const USER_SELECT = {
  id: true,
  name: true,
  lastName: true,
  username: true,
  avatar: true,
  email: true,
  isGhost: true,
} as const

/**
 * Fuente de verdad:
 *   PTS = 2 * 2PM + 3 * 3PM + FTM
 *   FGM = 2PM + 3PM
 *   FGA = 2PA + 3PA
 */
function pointsFromBreakdown(args: {
  twoPointersMade: number
  threePointersMade: number
  freeThrowsMade: number
}): number {
  return (
    2 * args.twoPointersMade +
    3 * args.threePointersMade +
    args.freeThrowsMade
  )
}

function derivedFieldGoals(args: {
  twoPointersMade: number
  twoPointersAttempted: number
  threePointersMade: number
  threePointersAttempted: number
}): { fieldGoalsMade: number; fieldGoalsAttempted: number } {
  return {
    fieldGoalsMade: args.twoPointersMade + args.threePointersMade,
    fieldGoalsAttempted:
      args.twoPointersAttempted + args.threePointersAttempted,
  }
}

function validateShotBreakdown(args: {
  twoPointersMade: number
  twoPointersAttempted: number
  threePointersMade: number
  threePointersAttempted: number
  freeThrowsMade: number
  freeThrowsAttempted: number
}) {
  const {
    twoPointersMade: p2m,
    twoPointersAttempted: p2a,
    threePointersMade: p3m,
    threePointersAttempted: p3a,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
  } = args
  if (p2m < 0 || p2a < 0 || p3m < 0 || p3a < 0 || ftm < 0 || fta < 0) {
    throw new BadRequestException(
      'Los valores del desglose de tiros no pueden ser negativos',
    )
  }
  if (p2m > p2a) {
    throw new BadRequestException(
      'Tiros de 2 anotados no puede ser mayor que intentados',
    )
  }
  if (p3m > p3a) {
    throw new BadRequestException(
      'Triples anotados no puede ser mayor que intentados',
    )
  }
  if (ftm > fta) {
    throw new BadRequestException(
      'Tiros libres anotados no puede ser mayor que intentados',
    )
  }
}


@Injectable()
export class MatchService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // CRUD PARTIDOS
  // ============================================

  async create(userId: string, createMatchDto: CreateMatchDto) {
    const team = await getTeamForViewer(
      this.prisma,
      userId,
      createMatchDto.teamId,
    )

    const isPadel = team.sport === 'PADEL'
    const subMatchesCount = isPadel ? createMatchDto.subMatchesCount ?? 3 : null
    const setsPerSubMatch = isPadel ? createMatchDto.setsPerSubMatch ?? 3 : null

    const match = await this.prisma.match.create({
      data: {
        date: new Date(createMatchDto.date),
        opponent: createMatchDto.opponent,
        location: createMatchDto.location as any,
        type: (createMatchDto.type as any) || 'LEAGUE',
        venue: createMatchDto.venue,
        competition: createMatchDto.competition,
        notes: createMatchDto.notes,
        teamId: createMatchDto.teamId,
        createdById: userId,
        subMatchesCount,
        setsPerSubMatch,
        season: createMatchDto.season ?? team.season ?? null,
      },
    })

    if (isPadel && subMatchesCount && setsPerSubMatch) {
      for (let i = 0; i < subMatchesCount; i++) {
        await this.prisma.padelSubMatch.create({
          data: {
            matchId: match.id,
            order: i + 1,
            sets: {
              create: Array.from({ length: setsPerSubMatch }, (_, j) => ({
                order: j + 1,
                played: false,
              })),
            },
          },
        })
      }
    }

    return this.prisma.match.findUnique({
      where: { id: match.id },
      include: {
        team: { include: { club: true } },
        callups: { include: { user: { select: USER_SELECT } } },
        playerStats: { include: { user: { select: USER_SELECT } } },
        padelSubMatches: {
          orderBy: { order: 'asc' },
          include: {
            player1: { select: USER_SELECT },
            player2: { select: USER_SELECT },
            sets: { orderBy: { order: 'asc' } },
          },
        },
      },
    })
  }

  async findAllByTeam(userId: string, teamId: string, season?: string) {
    await getTeamForViewer(this.prisma, userId, teamId)

    const where: any = { teamId }
    if (season) where.season = season

    return this.prisma.match.findMany({
      where,
      include: {
        team: { include: { club: true } },
        _count: {
          select: { callups: true, playerStats: true },
        },
      },
      orderBy: { date: 'desc' },
    })
  }

  async findSeasonsByTeam(userId: string, teamId: string): Promise<string[]> {
    await getTeamForViewer(this.prisma, userId, teamId)

    const rows = await this.prisma.match.findMany({
      where: { teamId, NOT: { season: null } },
      select: { season: true },
      distinct: ['season'],
    })

    const seasons = rows.map((r) => r.season).filter((s): s is string => !!s)

    seasons.sort((a, b) => b.localeCompare(a))

    return seasons
  }

  async findOne(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        team: {
          include: {
            club: true,
            memberships: {
              where: {
                roles: { some: { roleRef: { name: 'PLAYER' } } },
                status: 'ACTIVE',
              },
              include: {
                user: { select: USER_SELECT },
                roles: { include: { roleRef: { select: { name: true } } } },
              },
              orderBy: { user: { lastName: 'asc' } },
            },
          },
        },
        callups: {
          include: { user: { select: USER_SELECT } },
          orderBy: { user: { lastName: 'asc' } },
        },
        playerStats: {
          include: { user: { select: USER_SELECT } },
          orderBy: { user: { lastName: 'asc' } },
        },
        padelSubMatches: {
          orderBy: { order: 'asc' },
          include: {
            player1: { select: USER_SELECT },
            player2: { select: USER_SELECT },
            sets: { orderBy: { order: 'asc' } },
          },
        },
      },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

        // ✅ NUEVO: Si es espectador, tiene un pase VIP y puede verlo.
    const isSpectator = await this.prisma.matchViewer.findUnique({
      where: { matchId_userId: { matchId, userId } }
    })

    if (!isSpectator) {
      // Si no es espectador, validamos el acceso normal (esto lanza error 403 si no es del equipo)
      await getTeamForViewer(this.prisma, userId, match.teamId)
    }

    return {
      ...match,
      team: {
        ...match.team,
        memberships: normalizeMembershipRolesList(match.team.memberships),
      },
    }
  }

  async update(userId: string, matchId: string, updateMatchDto: UpdateMatchDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    const data: any = { ...updateMatchDto }
    if (data.date) {
      data.date = new Date(data.date)
    }

    return this.prisma.match.update({
      where: { id: matchId },
      data,
    })
  }

  async remove(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return this.prisma.match.delete({
      where: { id: matchId },
    })
  }

  // ============================================
  // RESULTADO
  // ============================================

  async updateResult(
    userId: string,
    matchId: string,
    updateResultDto: UpdateResultDto,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        teamScore: updateResultDto.teamScore,
        opponentScore: updateResultDto.opponentScore,
        manualWinner: updateResultDto.manualWinner ?? null,
        status: 'FINISHED',
      },
    })
  }

  // ============================================
  // CONVOCATORIA
  // ============================================

  async createCallups(userId: string, matchId: string, userIds: string[]) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    const results = []
    for (const targetUserId of userIds) {
      try {
        const callup = await this.prisma.matchCallup.upsert({
          where: {
            matchId_userId: { matchId, userId: targetUserId },
          },
          update: {
            calledUpStatus: 'YES',
          },
          create: {
            matchId,
            userId: targetUserId,
            availableStatus: 'PENDING',
            calledUpStatus: 'YES',
            confirmedStatus: 'PENDING',
          },
        })
        results.push(callup)
      } catch (error) {
        console.log(`Error con usuario ${targetUserId}:`, error)
      }
    }

    return results
  }

  async getCallups(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return this.prisma.matchCallup.findMany({
      where: { matchId },
      include: { user: { select: USER_SELECT } },
      orderBy: { user: { lastName: 'asc' } },
    })
  }

  async updateCallupFlags(
    userId: string,
    matchId: string,
    targetUserId: string,
    flags: {
      availableStatus?: 'PENDING' | 'YES' | 'NO'
      calledUpStatus?: 'PENDING' | 'YES' | 'NO'
      confirmedStatus?: 'PENDING' | 'YES' | 'NO'
      notes?: string
    },
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return this.prisma.matchCallup.upsert({
      where: {
        matchId_userId: { matchId, userId: targetUserId },
      },
      update: {
        ...flags,
        respondedAt: new Date(),
      },
      create: {
        matchId,
        userId: targetUserId,
        availableStatus: flags.availableStatus ?? 'PENDING',
        calledUpStatus: flags.calledUpStatus ?? 'PENDING',
        confirmedStatus: flags.confirmedStatus ?? 'PENDING',
        notes: flags.notes,
        respondedAt: new Date(),
      },
    })
  }

  async removeCallup(userId: string, matchId: string, targetUserId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return this.prisma.matchCallup.delete({
      where: {
        matchId_userId: {
          matchId,
          userId: targetUserId,
        },
      },
    })
  }

  // ============================================
  // CANDIDATOS DE OTROS EQUIPOS DEL CLUB
  // ============================================

  async getCandidatesFromClub(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { team: true },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        roles: { some: { roleRef: { name: 'PLAYER' } } },
        status: 'ACTIVE',
        team: {
          clubId: match.team.clubId,
          id: { not: match.teamId },
        },
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

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  async upsertPlayerStats(
    userId: string,
    matchId: string,
    targetUserId: string,
    stats: UpdateStatsDto,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    const current = await this.prisma.matchPlayerStats.findUnique({
      where: {
        matchId_userId: { matchId, userId: targetUserId },
      },
    })

    const p2m =
      stats.twoPointersMade !== undefined
        ? stats.twoPointersMade
        : current?.twoPointersMade ?? 0
    const p2a =
      stats.twoPointersAttempted !== undefined
        ? stats.twoPointersAttempted
        : current?.twoPointersAttempted ?? 0
    const p3m =
      stats.threePointersMade !== undefined
        ? stats.threePointersMade
        : current?.threePointersMade ?? 0
    const p3a =
      stats.threePointersAttempted !== undefined
        ? stats.threePointersAttempted
        : current?.threePointersAttempted ?? 0
    const ftm =
      stats.freeThrowsMade !== undefined
        ? stats.freeThrowsMade
        : current?.freeThrowsMade ?? 0
    const fta =
      stats.freeThrowsAttempted !== undefined
        ? stats.freeThrowsAttempted
        : current?.freeThrowsAttempted ?? 0

    validateShotBreakdown({
      twoPointersMade: p2m,
      twoPointersAttempted: p2a,
      threePointersMade: p3m,
      threePointersAttempted: p3a,
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
    })

    const derivedFg = derivedFieldGoals({
      twoPointersMade: p2m,
      twoPointersAttempted: p2a,
      threePointersMade: p3m,
      threePointersAttempted: p3a,
    })
    const recomputedPoints = pointsFromBreakdown({
      twoPointersMade: p2m,
      threePointersMade: p3m,
      freeThrowsMade: ftm,
    })

    // Construimos el payload sin los campos derivados del DTO, y los
    // añadimos calculados al final. `stats.points`,
    // `stats.fieldGoalsMade` y `stats.fieldGoalsAttempted` se ignoran.
    const {
      points: _ignoredPoints,
      fieldGoalsMade: _ignoredFgm,
      fieldGoalsAttempted: _ignoredFga,
      ...rest
    } = stats as any

    const data: any = {
      ...rest,
      twoPointersMade: p2m,
      twoPointersAttempted: p2a,
      threePointersMade: p3m,
      threePointersAttempted: p3a,
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
      fieldGoalsMade: derivedFg.fieldGoalsMade,
      fieldGoalsAttempted: derivedFg.fieldGoalsAttempted,
      points: recomputedPoints,
    }

    return this.prisma.matchPlayerStats.upsert({
      where: {
        matchId_userId: {
          matchId,
          userId: targetUserId,
        },
      },
      update: data,
      create: {
        matchId,
        userId: targetUserId,
        ...data,
      },
      include: { user: { select: USER_SELECT } },
    })
  }
  async getPlayerStats(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return this.prisma.matchPlayerStats.findMany({
      where: { matchId },
      include: { user: { select: USER_SELECT } },
      orderBy: { user: { lastName: 'asc' } },
    })
  }

  async setPlayerExclusion(
    userId: string,
    matchId: string,
    targetUserId: string,
    excluded: boolean,
  ): Promise<{ excluded: boolean }> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, teamId: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')

    await getTeamForViewer(this.prisma, userId, match.teamId)

    if (excluded) {
      await this.prisma.$transaction([
        this.prisma.matchPlayerStats.deleteMany({
          where: { matchId, userId: targetUserId },
        }),
        this.prisma.matchExcludedPlayer.upsert({
          where: {
            matchId_userId: { matchId, userId: targetUserId },
          },
          update: {},
          create: { matchId, userId: targetUserId },
        }),
      ])
    } else {
      await this.prisma.matchExcludedPlayer.deleteMany({
        where: { matchId, userId: targetUserId },
      })
    }

    return { excluded }
  }

  // ============================================
  // LINE UP
  // ============================================

  async updateLineup(userId: string, matchId: string, lineup: any) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return this.prisma.match.update({
      where: { id: matchId },
      data: { lineup },
    })
  }

  // ============================================
  // PLAN DE PARTIDO
  // ============================================

  async updateGamePlan(userId: string, matchId: string, gamePlan: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return this.prisma.match.update({
      where: { id: matchId },
      data: { gamePlan },
    })
  }

  // ============================================
  // ESTADÍSTICAS DEL EQUIPO
  // ============================================

  async getTeamStats(userId: string, teamId: string) {
    await getTeamForViewer(this.prisma, userId, teamId)

    const matches = await this.prisma.match.findMany({
      where: { teamId, status: 'FINISHED' },
      include: { playerStats: true },
    })

    const totalMatches = matches.length
    const wins = matches.filter(
      (m) => (m.teamScore || 0) > (m.opponentScore || 0),
    ).length
    const losses = matches.filter(
      (m) => (m.teamScore || 0) < (m.opponentScore || 0),
    ).length
    const draws = matches.filter(
      (m) => (m.teamScore || 0) === (m.opponentScore || 0),
    ).length

    const totalPoints = matches.reduce((acc, m) => acc + (m.teamScore || 0), 0)
    const totalOpponentPoints = matches.reduce(
      (acc, m) => acc + (m.opponentScore || 0),
      0,
    )
    const avgPoints = totalMatches > 0 ? totalPoints / totalMatches : 0
    const avgOpponentPoints =
      totalMatches > 0 ? totalOpponentPoints / totalMatches : 0

    return {
      totalMatches,
      wins,
      losses,
      draws,
      totalPoints,
      totalOpponentPoints,
      avgPoints: Math.round(avgPoints * 10) / 10,
      avgOpponentPoints: Math.round(avgOpponentPoints * 10) / 10,
      winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
    }
  }

  // ============================================
  // PÁDEL
  // ============================================

  async addPadelSubMatch(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { padelSubMatches: true, team: true },
    })

    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    let setsPerSubMatch = match.setsPerSubMatch
    let subMatchesCount = match.subMatchesCount

    if (
      (subMatchesCount == null || setsPerSubMatch == null) &&
      match.team.sport === 'PADEL'
    ) {
      subMatchesCount = subMatchesCount ?? 3
      setsPerSubMatch = setsPerSubMatch ?? 2

      await this.prisma.match.update({
        where: { id: matchId },
        data: { subMatchesCount, setsPerSubMatch },
      })
    }

    if (setsPerSubMatch == null) {
      throw new BadRequestException('Este partido no es de pádel')
    }

    const nextOrder = match.padelSubMatches.length + 1

    return this.prisma.padelSubMatch.create({
      data: {
        matchId,
        order: nextOrder,
        sets: {
          create: Array.from({ length: setsPerSubMatch }, (_, j) => ({
            order: j + 1,
            played: false,
          })),
        },
      },
      include: {
        player1: { select: USER_SELECT },
        player2: { select: USER_SELECT },
        sets: { orderBy: { order: 'asc' } },
      },
    })
  }

  async removePadelSubMatch(userId: string, subMatchId: string) {
    const subMatch = await this.prisma.padelSubMatch.findUnique({
      where: { id: subMatchId },
      include: { match: true },
    })

    if (!subMatch) throw new NotFoundException('Pista no encontrada')
    await getTeamForViewer(this.prisma, userId, subMatch.match.teamId)

    await this.prisma.padelSubMatch.delete({ where: { id: subMatchId } })

    const remaining = await this.prisma.padelSubMatch.findMany({
      where: { matchId: subMatch.matchId },
      orderBy: { order: 'asc' },
    })

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i + 1) {
        await this.prisma.padelSubMatch.update({
          where: { id: remaining[i].id },
          data: { order: i + 1 },
        })
      }
    }

    return { ok: true }
  }

  async reorderPadelSubMatches(
    userId: string,
    matchId: string,
    subMatchIds: string[],
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    await this.prisma.$transaction(
      subMatchIds.map((id, index) =>
        this.prisma.padelSubMatch.update({
          where: { id },
          data: { order: index + 1 },
        }),
      ),
    )

    return { ok: true }
  }

  async updatePadelSubMatchPlayer(
    userId: string,
    subMatchId: string,
    playerSlot: 1 | 2,
    targetUserId: string | null,
  ) {
    const subMatch = await this.prisma.padelSubMatch.findUnique({
      where: { id: subMatchId },
      include: { match: true },
    })

    if (!subMatch) throw new NotFoundException('Pista no encontrada')
    await getTeamForViewer(this.prisma, userId, subMatch.match.teamId)

    if (targetUserId) {
      const callup = await this.prisma.matchCallup.findUnique({
        where: {
          matchId_userId: {
            matchId: subMatch.matchId,
            userId: targetUserId,
          },
        },
      })
      if (!callup) {
        throw new BadRequestException('El jugador no está convocado al partido')
      }
    }

    return this.prisma.padelSubMatch.update({
      where: { id: subMatchId },
      data:
        playerSlot === 1
          ? { player1Id: targetUserId }
          : { player2Id: targetUserId },
      include: {
        player1: { select: USER_SELECT },
        player2: { select: USER_SELECT },
        sets: { orderBy: { order: 'asc' } },
      },
    })
  }

  async updatePadelSet(
    userId: string,
    setId: string,
    data: { homeScore?: number; awayScore?: number; played?: boolean },
  ) {
    const set = await this.prisma.padelSet.findUnique({
      where: { id: setId },
      include: { subMatch: { include: { match: true } } },
    })

    if (!set) throw new NotFoundException('Set no encontrado')
    await getTeamForViewer(this.prisma, userId, set.subMatch.match.teamId)

    return this.prisma.padelSet.update({
      where: { id: setId },
      data: {
        ...(data.homeScore !== undefined && { homeScore: data.homeScore }),
        ...(data.awayScore !== undefined && { awayScore: data.awayScore }),
        ...(data.played !== undefined && { played: data.played }),
      },
    })
  }

  async addSetToSubMatch(userId: string, subMatchId: string) {
    const subMatch = await this.prisma.padelSubMatch.findUnique({
      where: { id: subMatchId },
      include: {
        match: true,
        sets: { orderBy: { order: 'desc' }, take: 1 },
      },
    })

    if (!subMatch) throw new NotFoundException('Pista no encontrada')
    await getTeamForViewer(this.prisma, userId, subMatch.match.teamId)

    const nextOrder = (subMatch.sets[0]?.order ?? 0) + 1

    return this.prisma.padelSet.create({
      data: {
        subMatchId,
        order: nextOrder,
        played: false,
        homeScore: 0,
        awayScore: 0,
      },
    })
  }

  async removeLastSetFromSubMatch(
    userId: string,
    subMatchId: string,
    force = false,
  ) {
    const subMatch = await this.prisma.padelSubMatch.findUnique({
      where: { id: subMatchId },
      include: {
        match: true,
        sets: { orderBy: { order: 'desc' }, take: 1 },
      },
    })

    if (!subMatch) throw new NotFoundException('Pista no encontrada')
    await getTeamForViewer(this.prisma, userId, subMatch.match.teamId)

    const lastSet = subMatch.sets[0]
    if (!lastSet) {
      throw new BadRequestException({
        code: 'NO_SETS',
        message: 'Esta pista no tiene sets que eliminar',
      })
    }

    const hasData =
      lastSet.played || lastSet.homeScore > 0 || lastSet.awayScore > 0

    if (hasData && !force) {
      throw new ConflictException({
        code: 'SET_HAS_DATA',
        message: `El Set ${lastSet.order} tiene datos (${lastSet.homeScore}-${lastSet.awayScore}). Confirma para eliminarlo.`,
      })
    }

    await this.prisma.padelSet.delete({ where: { id: lastSet.id } })

    return { ok: true, deletedSetOrder: lastSet.order }
  }

  // ============================================
  // ESTADÍSTICAS DE PÁDEL POR PARTIDO
  // ============================================

  async getPadelStats(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        padelSubMatches: {
          orderBy: { order: 'asc' },
          include: {
            player1: { select: USER_SELECT },
            player2: { select: USER_SELECT },
            sets: { orderBy: { order: 'asc' } },
          },
        },
        callups: {
          include: { user: { select: USER_SELECT } },
        },
      },
    })

    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    const payload = computePadelStatsFromMatch({
      id: match.id,
      teamId: match.teamId,
      date: match.date,
      opponent: match.opponent,
      location: match.location as any,
      teamScore: match.teamScore,
      opponentScore: match.opponentScore,
      padelSubMatches: match.padelSubMatches.map((sm) => ({
        id: sm.id,
        order: sm.order,
        player1: sm.player1
          ? {
              id: sm.player1.id,
              name: sm.player1.name,
              lastName: sm.player1.lastName,
            }
          : null,
        player2: sm.player2
          ? {
              id: sm.player2.id,
              name: sm.player2.name,
              lastName: sm.player2.lastName,
            }
          : null,
        sets: sm.sets.map((s) => ({
          id: s.id,
          order: s.order,
          homeScore: s.homeScore,
          awayScore: s.awayScore,
          played: s.played,
        })),
      })),
    })

    const viewerRole = await resolveViewerStatsRole(
      this.prisma,
      userId,
      match.teamId,
    )
    const configRows = await this.prisma.statsVisibilityConfig.findMany({
      where: { teamId: match.teamId, sport: 'PADEL' },
    })
    const visibleKeys = buildVisibleKeys(
      'PADEL',
      'MATCH',
      viewerRole,
      configRows as any,
    )

    const visibleMetrics = filterStatsPayload('PADEL', visibleKeys, payload)

    return {
      ...payload,
      visibleMetrics: Array.from(visibleMetrics),
    }
  }

  // ============================================
  // ESTADÍSTICAS DE BALONCESTO POR PARTIDO
  // ============================================

  async getBasketballStats(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        playerStats: {
          include: { user: { select: USER_SELECT } },
          orderBy: { user: { lastName: 'asc' } },
        },
        callups: {
          include: { user: { select: USER_SELECT } },
        },
        excludedPlayers: {
          select: { userId: true },
        },
      },
    })

    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    const payload = computeBasketballStatsFromMatch({
      id: match.id,
      teamId: match.teamId,
      date: match.date,
      opponent: match.opponent,
      teamScore: match.teamScore,
      opponentScore: match.opponentScore,
      playerStats: match.playerStats.map((ps) => ({
        userId: ps.userId,
        user: {
          id: ps.user.id,
          name: ps.user.name,
          lastName: ps.user.lastName,
        },
        minutes: ps.minutes,
        seconds: ps.seconds,
        points: ps.points,
        rebounds: ps.rebounds,
        assists: ps.assists,
        steals: ps.steals,
        blocks: ps.blocks,
        turnovers: ps.turnovers,
        fouls: ps.fouls,
        blocksAgainst: ps.blocksAgainst,
        foulsDrawn: ps.foulsDrawn,
        plusMinus: ps.plusMinus,
                twoPointersMade: ps.twoPointersMade,         // ← NUEVO
        twoPointersAttempted: ps.twoPointersAttempted, // ← NUEVO
        fieldGoalsMade: ps.fieldGoalsMade,
        fieldGoalsAttempted: ps.fieldGoalsAttempted,
        threePointersMade: ps.threePointersMade,
        threePointersAttempted: ps.threePointersAttempted,
        freeThrowsMade: ps.freeThrowsMade,
        freeThrowsAttempted: ps.freeThrowsAttempted,
      })),
    })

    const viewerRole = await resolveViewerStatsRole(
      this.prisma,
      userId,
      match.teamId,
    )
    const configRows = await this.prisma.statsVisibilityConfig.findMany({
      where: { teamId: match.teamId, sport: 'BASKETBALL' },
    })
    const visibleKeys = buildVisibleKeys(
      'BASKETBALL',
      'MATCH',
      viewerRole,
      configRows as any,
    )

    const visibleMetrics = filterStatsPayload(
      'BASKETBALL',
      visibleKeys,
      payload,
    )

    return {
      ...payload,
      visibleMetrics: Array.from(visibleMetrics),
      excludedPlayerIds: match.excludedPlayers.map((e) => e.userId),
    }
  }

  async removePlayerStats(
    userId: string,
    matchId: string,
    targetUserId: string,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    await this.prisma.matchPlayerStats.deleteMany({
      where: { matchId, userId: targetUserId },
    })

    await this.prisma.matchCallup.deleteMany({
      where: { matchId, userId: targetUserId },
    })

    return { ok: true }
  }

  // ============================================
  // OPONENTES (rival del partido)
  // ============================================

  async getOpponents(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { teamId: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    if (!(await canViewTeam(this.prisma, userId, match.teamId))) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    const opponents = await this.prisma.matchOpponentPlayer.findMany({
      where: { matchId },
      orderBy: { number: 'asc' },
      include: { stats: true },
    })

    return opponents.map((op) => ({
      id: op.id,
      userId: op.userId,
      number: op.number,
      name: op.name,
      position: op.position,
            stats: op.stats
        ? {
            matchesCount: 0,
            minutes: op.stats.minutes,
            seconds: op.stats.seconds,
            points: op.stats.points,
            rebounds: op.stats.rebounds,
            reboundsOff: op.stats.reboundsOff,
            reboundsDef: op.stats.reboundsDef,
            assists: op.stats.assists,
            steals: op.stats.steals,
            blocks: op.stats.blocks,
            turnovers: op.stats.turnovers,
            fouls: op.stats.fouls,
            twoPointersMade: op.stats.twoPointersMade,
            twoPointersAttempted: op.stats.twoPointersAttempted,
            fieldGoalsMade: op.stats.fieldGoalsMade,
            fieldGoalsAttempted: op.stats.fieldGoalsAttempted,
            threePointersMade: op.stats.threePointersMade,
            threePointersAttempted: op.stats.threePointersAttempted,
            freeThrowsMade: op.stats.freeThrowsMade,
            freeThrowsAttempted: op.stats.freeThrowsAttempted,
          }
        : null,
    }))
  }

  async addOpponentPlayers(
    userId: string,
    matchId: string,
    dto: { players: { number: number; name?: string; position?: string }[] },
   ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, teamId: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

        const numbers = dto.players.map((p) => p.number)
    const dup = numbers.find((n, i) => numbers.indexOf(n) !== i)
    if (dup !== undefined) {
      throw new BadRequestException(`Número de jugador duplicado: ${dup}`)
    }

    const existing = await this.prisma.matchOpponentPlayer.findMany({
      where: { matchId },
      select: { number: true },
    })

    const MAX_OPPONENTS = 15
    if (existing.length + dto.players.length > MAX_OPPONENTS) {
      throw new BadRequestException(
        `Un partido no puede tener más de ${MAX_OPPONENTS} rivales. Ya hay ${existing.length}.`,
      )
    }

    const existingNums = new Set(existing.map((e) => e.number))
    for (const n of numbers) {
      if (existingNums.has(n)) {
        throw new ConflictException(`Ya existe un rival con el número ${n}`)
      }
    }

    await this.prisma.matchOpponentPlayer.createMany({
      data: dto.players.map((p) => ({
        matchId,
        number: p.number,
        name: p.name ?? null,
        position: p.position ?? null,
      })),
    })

    return { ok: true }
  }

    async removeOpponentPlayer(
    userId: string,
    matchId: string,
    opponentPlayerId: string,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { teamId: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    const opponent = await this.prisma.matchOpponentPlayer.findUnique({
      where: { id: opponentPlayerId },
      select: { id: true, matchId: true },
    })
    if (!opponent || opponent.matchId !== matchId) {
      throw new NotFoundException('Jugador rival no encontrado')
    }

    await this.prisma.matchOpponentPlayer.delete({
      where: { id: opponentPlayerId },
    })

    return { ok: true }
  }

  async updateOpponentStats(
    userId: string,
    matchId: string,
    opponentPlayerId: string,
    dto: any,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { teamId: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    const opponent = await this.prisma.matchOpponentPlayer.findUnique({
      where: { id: opponentPlayerId },
      select: { id: true, matchId: true },
    })
    if (!opponent || opponent.matchId !== matchId) {
      throw new NotFoundException('Jugador rival no encontrado')
    }

    const data: any = {}
    const fields = [
      'minutes',
      'seconds',
      'points',
      'rebounds',
      'reboundsOff',
      'reboundsDef',
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
      if (dto[f] !== undefined) data[f] = dto[f]
    }

    return this.prisma.matchOpponentPlayerStats.upsert({
      where: { matchOpponentPlayerId: opponent.id },
      update: data,
      create: {
        matchOpponentPlayerId: opponent.id,
        ...data,
      },
    })
  }

  // ============================================
  // CAMBIAR ESTADO DEL PARTIDO (cerrar/reabrir)
  // ============================================

  async updateStatus(
    userId: string,
    matchId: string,
    status:
      | 'SCHEDULED'
      | 'IN_PROGRESS'
      | 'FINISHED'
      | 'CANCELLED'
      | 'POSTPONED',
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, teamId: true, status: true },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    const wasFinished = match.status === 'FINISHED'
    const willBeFinished = status === 'FINISHED'

    await this.prisma.match.update({
      where: { id: matchId },
      data: { status },
    })

    // Recalcular globales del rival si el partido entra o sale del cómputo
    if (wasFinished !== willBeFinished) {
      await this.recomputeTeamOpponentStats(match.teamId)
    }

    return { ok: true, status }
  }

  // Alias por compatibilidad con llamadas antiguas a POST /close
  async closeMatch(userId: string, matchId: string) {
    return this.updateStatus(userId, matchId, 'FINISHED')
  }

    private async recomputeTeamOpponentStats(teamId: string) {
    await this.prisma.$transaction(async (tx) => {
      const matchOpponents = await tx.matchOpponentPlayer.findMany({
        where: { match: { teamId, status: 'FINISHED' } },
        include: { stats: true },
      })

      type Agg = {
        userId: string | null
        number: number
        name: string | null
        position: string | null
        matchesCount: number
        minutes: number
        seconds: number
        points: number
        rebounds: number
        reboundsOff: number
        reboundsDef: number
        assists: number
        steals: number
        blocks: number
        turnovers: number
        fouls: number
        twoPointersMade: number
        twoPointersAttempted: number
        fieldGoalsMade: number
        fieldGoalsAttempted: number
        threePointersMade: number
        threePointersAttempted: number
        freeThrowsMade: number
        freeThrowsAttempted: number
        blocksAgainst: number
        foulsDrawn: number
        plusMinus: number
      }

      const byNumber = new Map<number, Agg>()

      for (const mop of matchOpponents) {
        const agg =
          byNumber.get(mop.number) ??
          ({
            userId: mop.userId,
            number: mop.number,
            name: mop.name,
            position: mop.position,
            matchesCount: 0,
            minutes: 0,
            seconds: 0,
            points: 0,
            rebounds: 0,
            reboundsOff: 0,
            reboundsDef: 0,
            assists: 0,
            steals: 0,
            blocks: 0,
            turnovers: 0,
            fouls: 0,
            twoPointersMade: 0,
            twoPointersAttempted: 0,
            fieldGoalsMade: 0,
            fieldGoalsAttempted: 0,
            threePointersMade: 0,
            threePointersAttempted: 0,
            freeThrowsMade: 0,
            freeThrowsAttempted: 0,
            blocksAgainst: 0,
            foulsDrawn: 0,
            plusMinus: 0,
          } as Agg)

        agg.matchesCount += 1
        const s = mop.stats
        if (s) {
          agg.minutes += s.minutes ?? 0
          agg.seconds += s.seconds ?? 0
          agg.points += s.points
          agg.rebounds += s.rebounds
          agg.reboundsOff += s.reboundsOff
          agg.reboundsDef += s.reboundsDef
          agg.assists += s.assists
          agg.steals += s.steals
          agg.blocks += s.blocks
          agg.turnovers += s.turnovers
          agg.fouls += s.fouls
          agg.twoPointersMade += s.twoPointersMade
          agg.twoPointersAttempted += s.twoPointersAttempted
          agg.fieldGoalsMade += s.fieldGoalsMade
          agg.fieldGoalsAttempted += s.fieldGoalsAttempted
          agg.threePointersMade += s.threePointersMade
          agg.threePointersAttempted += s.threePointersAttempted
          agg.freeThrowsMade += s.freeThrowsMade
          agg.freeThrowsAttempted += s.freeThrowsAttempted
          agg.blocksAgainst += s.blocksAgainst
          agg.foulsDrawn += s.foulsDrawn
          agg.plusMinus += s.plusMinus ?? 0
        }
        byNumber.set(mop.number, agg)
      }

      await tx.teamOpponentPlayer.deleteMany({ where: { teamId } })

      for (const agg of byNumber.values()) {
        const totalSecs = agg.minutes * 60 + agg.seconds
        const minutes = Math.floor(totalSecs / 60)
        const seconds = totalSecs % 60

        const top = await tx.teamOpponentPlayer.create({
          data: {
            teamId,
            userId: agg.userId,
            number: agg.number,
            name: agg.name,
            position: agg.position,
          },
        })
        await tx.teamOpponentPlayerStats.create({
          data: {
            teamOpponentPlayerId: top.id,
            matchesCount: agg.matchesCount,
            minutes,
            seconds,
            points: agg.points,
            rebounds: agg.rebounds,
            reboundsOff: agg.reboundsOff,
            reboundsDef: agg.reboundsDef,
            assists: agg.assists,
            steals: agg.steals,
            blocks: agg.blocks,
            turnovers: agg.turnovers,
            fouls: agg.fouls,
            twoPointersMade: agg.twoPointersMade,
            twoPointersAttempted: agg.twoPointersAttempted,
            fieldGoalsMade: agg.fieldGoalsMade,
            fieldGoalsAttempted: agg.fieldGoalsAttempted,
            threePointersMade: agg.threePointersMade,
            threePointersAttempted: agg.threePointersAttempted,
            freeThrowsMade: agg.freeThrowsMade,
            freeThrowsAttempted: agg.freeThrowsAttempted,
            blocksAgainst: agg.blocksAgainst,
            foulsDrawn: agg.foulsDrawn,
            plusMinus: agg.plusMinus,
          },
        })
      }
    })
  }

  
}