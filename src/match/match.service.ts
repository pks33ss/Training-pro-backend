import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMatchDto } from './dto/create-match.dto'
import { UpdateMatchDto } from './dto/update-match.dto'
import { UpdateResultDto } from './dto/update-result.dto'
import { UpdateStatsDto } from './dto/update-stats.dto'
import { getTeamForViewer, resolveViewerStatsRole } from '../common/access'
import { computePadelStatsFromMatch } from '../stats/padel-stats.helper'
import { computeBasketballStatsFromMatch } from '../stats/basketball-stats.helper'
import { buildVisibleKeys, filterStatsPayload } from '../stats/stats-filter'


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
export class MatchService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // CRUD PARTIDOS
  // ============================================

  async create(userId: string, createMatchDto: CreateMatchDto) {
    const team = await getTeamForViewer(this.prisma, userId, createMatchDto.teamId)

    const isPadel = team.sport === 'PADEL'
    const subMatchesCount = isPadel ? (createMatchDto.subMatchesCount ?? 3) : null
    const setsPerSubMatch = isPadel ? (createMatchDto.setsPerSubMatch ?? 3) : null

    const match = await this.prisma.match.create({
      data: {
        date: new Date(createMatchDto.date),
        opponent: createMatchDto.opponent,
        location: (createMatchDto.location as any) || 'HOME',
        type: (createMatchDto.type as any) || 'LEAGUE',
        venue: createMatchDto.venue,
        competition: createMatchDto.competition,
        notes: createMatchDto.notes,
        teamId: createMatchDto.teamId,
        createdById: userId,
        subMatchesCount,
        setsPerSubMatch,
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

  async findAllByTeam(userId: string, teamId: string) {
    await getTeamForViewer(this.prisma, userId, teamId)

    return this.prisma.match.findMany({
      where: { teamId },
      include: {
        team: { include: { club: true } },
        _count: {
          select: { callups: true, playerStats: true },
        },
      },
      orderBy: { date: 'desc' },
    })
  }

  async findOne(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        team: {
          include: {
            club: true,
            memberships: {
              where: { roles: { some: { role: 'PLAYER' } }, status: 'ACTIVE' },
              include: {
                user: { select: USER_SELECT },
                roles: true,
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

    await getTeamForViewer(this.prisma, userId, match.teamId)

    return {
      ...match,
      team: {
        ...match.team,
        memberships: (match.team.memberships ?? []).map((m: any) => ({
          ...m,
          role: m.roles?.[0]?.role ?? 'PLAYER',
          roles: (m.roles ?? []).map((r: any) => r.role),
        })),
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

  async updateResult(userId: string, matchId: string, updateResultDto: UpdateResultDto) {
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
        roles: { some: { role: 'PLAYER' } },
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
      orderBy: [
        { team: { name: 'asc' } },
        { user: { lastName: 'asc' } },
      ],
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

    return this.prisma.matchPlayerStats.upsert({
      where: {
        matchId_userId: {
          matchId,
          userId: targetUserId,
        },
      },
      update: stats,
      create: {
        matchId,
        userId: targetUserId,
        ...stats,
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
    const wins = matches.filter((m) => (m.teamScore || 0) > (m.opponentScore || 0)).length
    const losses = matches.filter((m) => (m.teamScore || 0) < (m.opponentScore || 0)).length
    const draws = matches.filter((m) => (m.teamScore || 0) === (m.opponentScore || 0)).length

    const totalPoints = matches.reduce((acc, m) => acc + (m.teamScore || 0), 0)
    const totalOpponentPoints = matches.reduce((acc, m) => acc + (m.opponentScore || 0), 0)
    const avgPoints = totalMatches > 0 ? totalPoints / totalMatches : 0
    const avgOpponentPoints = totalMatches > 0 ? totalOpponentPoints / totalMatches : 0

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
  // PÁDEL — SUBPARTIDOS (PISTAS)
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
      teamScore: match.teamScore,
      opponentScore: match.opponentScore,
      padelSubMatches: match.padelSubMatches.map((sm) => ({
        id: sm.id,
        order: sm.order,
        player1: sm.player1
          ? { id: sm.player1.id, name: sm.player1.name, lastName: sm.player1.lastName }
          : null,
        player2: sm.player2
          ? { id: sm.player2.id, name: sm.player2.name, lastName: sm.player2.lastName }
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

    // Filtrado por config de visibilidad
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
        fieldGoalsMade: ps.fieldGoalsMade,
        fieldGoalsAttempted: ps.fieldGoalsAttempted,
        threePointersMade: ps.threePointersMade,
        threePointersAttempted: ps.threePointersAttempted,
        freeThrowsMade: ps.freeThrowsMade,
        freeThrowsAttempted: ps.freeThrowsAttempted,
      })),
    })

    // Filtrado por config de visibilidad
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
    }
  }

  async removePlayerStats(userId: string, matchId: string, targetUserId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await getTeamForViewer(this.prisma, userId, match.teamId)

    // Borra las stats si existen; no falla si no existen
    await this.prisma.matchPlayerStats.deleteMany({
      where: { matchId, userId: targetUserId },
    })

    // Opcional: borrar también el callup de ese partido
    await this.prisma.matchCallup.deleteMany({
      where: { matchId, userId: targetUserId },
    })

    return { ok: true }
  }
}