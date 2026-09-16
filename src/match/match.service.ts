import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMatchDto } from './dto/create-match.dto'
import { UpdateMatchDto } from './dto/update-match.dto'
import { UpdateResultDto } from './dto/update-result.dto'
import { UpdateStatsDto } from './dto/update-stats.dto'

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

    const clubMember = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        isActive: true,
      },
    })

    const teamMember = await this.prisma.teamMember.findFirst({
      where: {
        userId: userId,
        teamId: teamId,
        isActive: true,
      },
    })

    if (!clubMember && !teamMember && !isSuperAdmin) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return team
  }

  // ============================================
  // CRUD PARTIDOS
  // ============================================

  async create(userId: string, createMatchDto: CreateMatchDto) {
    await this.verifyTeamAccess(userId, createMatchDto.teamId)

    return this.prisma.match.create({
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
      },
      include: {
        team: {
          include: { club: true },
        },
        callups: {
          include: {
            player: true,
          },
        },
        playerStats: {
          include: {
            player: true,
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
        team: {
          include: { club: true },
        },
        _count: {
          select: {
            callups: true,
            playerStats: true,
          },
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
          include: { club: true },
        },
        callups: {
          include: {
            player: true,
          },
          orderBy: {
            player: { number: 'asc' },
          },
        },
        playerStats: {
          include: {
            player: true,
          },
          orderBy: {
            player: { number: 'asc' },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            lastName: true,
          },
        },
      },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await this.verifyTeamAccess(userId, match.teamId)

    return match
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

  async createCallups(userId: string, matchId: string, playerIds: string[]) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await this.verifyTeamAccess(userId, match.teamId)

    const results = []
    for (const playerId of playerIds) {
      try {
        const callup = await this.prisma.matchCallup.create({
          data: {
            matchId,
            playerId,
            status: 'PENDING',
          },
        })
        results.push(callup)
      } catch (error) {
        console.log(`Jugador ${playerId} ya convocado`)
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
      include: {
        player: true,
      },
      orderBy: {
        player: { number: 'asc' },
      },
    })
  }

  async updateCallupStatus(
    userId: string,
    matchId: string,
    playerId: string,
    status: string,
    notes?: string,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await this.verifyTeamAccess(userId, match.teamId)

    return this.prisma.matchCallup.update({
      where: {
        matchId_playerId: {
          matchId,
          playerId,
        },
      },
      data: {
        status: status as any,
        notes,
        respondedAt: new Date(),
      },
    })
  }

  async removeCallup(userId: string, matchId: string, playerId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    })

    if (!match) {
      throw new NotFoundException('Partido no encontrado')
    }

    await this.verifyTeamAccess(userId, match.teamId)

    return this.prisma.matchCallup.delete({
      where: {
        matchId_playerId: {
          matchId,
          playerId,
        },
      },
    })
  }

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  async upsertPlayerStats(
    userId: string,
    matchId: string,
    playerId: string,
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
        matchId_playerId: {
          matchId,
          playerId,
        },
      },
      update: stats,
      create: {
        matchId,
        playerId,
        ...stats,
      },
      include: {
        player: true,
      },
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
      include: {
        player: true,
      },
      orderBy: {
        player: { number: 'asc' },
      },
    })
  }

  // ============================================
  // ESTADÍSTICAS DEL EQUIPO
  // ============================================

  async getTeamStats(userId: string, teamId: string) {
    await this.verifyTeamAccess(userId, teamId)

    const matches = await this.prisma.match.findMany({
      where: {
        teamId,
        status: 'FINISHED',
      },
      include: {
        playerStats: true,
      },
    })

    const totalMatches = matches.length
    const wins = matches.filter(m => 
      (m.teamScore || 0) > (m.opponentScore || 0)
    ).length
    const losses = matches.filter(m => 
      (m.teamScore || 0) < (m.opponentScore || 0)
    ).length
    const draws = matches.filter(m => 
      (m.teamScore || 0) === (m.opponentScore || 0)
    ).length

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
}