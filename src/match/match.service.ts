import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMatchDto } from './dto/create-match.dto'
import { UpdateMatchDto } from './dto/update-match.dto'
import { UpdateResultDto } from './dto/update-result.dto'
import { UpdateStatsDto } from './dto/update-stats.dto'


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
  // VERIFICAR ACCESO
  // ============================================
  private async verifyTeamAccess(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'
    if (isSuperAdmin) return team

    const clubAdmin = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId, isActive: true, role: 'ADMIN_CLUB' },
    })
    if (clubAdmin) return team

    const clubMember = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId, isActive: true },
    })
    if (clubMember) return team

    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId, teamId, status: 'ACTIVE' },
    })
    if (membership) return team

    throw new ForbiddenException('No tienes acceso a este equipo')
  }

  // ============================================
  // CRUD PARTIDOS
  // ============================================

    async create(userId: string, createMatchDto: CreateMatchDto) {
    const team = await this.verifyTeamAccess(userId, createMatchDto.teamId)

    const isPadel = team.sport === 'PADEL'
    const subMatchesCount = isPadel ? (createMatchDto.subMatchesCount ?? 3) : null
    const setsPerSubMatch = isPadel ? (createMatchDto.setsPerSubMatch ?? 3) : null

    // Crear el match
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

    // Si es pádel, crear las pistas + sets
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

    // Devolver con includes
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
    await this.verifyTeamAccess(userId, teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

    // ✅ Ahora buscamos TeamMembership con rol PLAYER
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

    // Formato plano para que el frontend lo use igual
    return memberships.map((m) => ({
      id: m.user.id,                // userId (el "id" que el frontend usa como player.id)
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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

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

    await this.verifyTeamAccess(userId, match.teamId)

    return this.prisma.match.update({
      where: { id: matchId },
      data: { gamePlan },
    })
  }

  // ============================================
  // ESTADÍSTICAS DEL EQUIPO
  // ============================================

  async getTeamStats(userId: string, teamId: string) {
    await this.verifyTeamAccess(userId, teamId)

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

  /**
   * Añade una nueva pista al final (con sus sets vacíos).
   */
  async addPadelSubMatch(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { padelSubMatches: true },
    })

    if (!match) throw new NotFoundException('Partido no encontrado')
    await this.verifyTeamAccess(userId, match.teamId)

    if (match.subMatchesCount == null || match.setsPerSubMatch == null) {
      throw new BadRequestException('Este partido no es de pádel')
    }

    const nextOrder = match.padelSubMatches.length + 1

    return this.prisma.padelSubMatch.create({
      data: {
        matchId,
        order: nextOrder,
        sets: {
          create: Array.from({ length: match.setsPerSubMatch }, (_, j) => ({
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

  /**
   * Elimina una pista (y sus sets en cascada).
   * Reordena las pistas restantes para que 1..N sin huecos.
   */
  async removePadelSubMatch(userId: string, subMatchId: string) {
    const subMatch = await this.prisma.padelSubMatch.findUnique({
      where: { id: subMatchId },
      include: { match: true },
    })

    if (!subMatch) throw new NotFoundException('Pista no encontrada')
    await this.verifyTeamAccess(userId, subMatch.match.teamId)

    await this.prisma.padelSubMatch.delete({ where: { id: subMatchId } })

    // Reordenar las pistas restantes
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

  /**
   * Reordena las pistas de un match según el array de ids.
   */
  async reorderPadelSubMatches(
    userId: string,
    matchId: string,
    subMatchIds: string[],
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })
    if (!match) throw new NotFoundException('Partido no encontrado')
    await this.verifyTeamAccess(userId, match.teamId)

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

  /**
   * Asigna (o desasigna) un jugador a una pista.
   * playerSlot = 1 (derecha) | 2 (izquierda).
   */
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
    await this.verifyTeamAccess(userId, subMatch.match.teamId)

    // Validar que el targetUserId está convocado (si viene)
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

  /**
   * Actualiza un set concreto.
   */
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
    await this.verifyTeamAccess(userId, set.subMatch.match.teamId)

    return this.prisma.padelSet.update({
      where: { id: setId },
      data: {
        ...(data.homeScore !== undefined && { homeScore: data.homeScore }),
        ...(data.awayScore !== undefined && { awayScore: data.awayScore }),
        ...(data.played !== undefined && { played: data.played }),
      },
    })
  }
}