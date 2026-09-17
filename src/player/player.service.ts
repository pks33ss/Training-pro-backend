import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreatePlayerDto } from './dto/create-player.dto'

@Injectable()
export class PlayerService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // JUGADORES
  // ============================================

  async create(userId: string, createPlayerDto: CreatePlayerDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: createPlayerDto.teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return this.prisma.player.create({
      data: {
        name: createPlayerDto.name,
        lastName: createPlayerDto.lastName,
        birthDate: createPlayerDto.birthDate ? new Date(createPlayerDto.birthDate) : undefined,
        position: createPlayerDto.position,
        number: createPlayerDto.number,
        phone: createPlayerDto.phone,
        email: createPlayerDto.email,
        address: createPlayerDto.address,
        height: createPlayerDto.height,
        wingspan: createPlayerDto.wingspan,
        weight: createPlayerDto.weight,
        teamId: createPlayerDto.teamId,
      },
      include: {
        team: {
          include: {
            club: true,
          },
        },
      },
    })
  }

  async findAllByTeam(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este equipo')
    }

    return this.prisma.player.findMany({
      where: { teamId },
      include: {
        tutors: true,
      },
      orderBy: [
        { number: 'asc' },
        { lastName: 'asc' },
      ],
    })
  }

  async findOne(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          include: {
            club: true,
          },
        },
        tutors: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador')
    }

    return player
  }

  async update(userId: string, playerId: string, updateData: any) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes permisos para editar este jugador')
    }

    const data: any = { ...updateData }

    // Convertir birthDate si existe
    if (data.birthDate) {
      data.birthDate = new Date(data.birthDate)
    }

    // Convertir números
    if (data.height) data.height = Number(data.height)
    if (data.wingspan) data.wingspan = Number(data.wingspan)
    if (data.weight) data.weight = Number(data.weight)
    if (data.number) data.number = Number(data.number)

    return this.prisma.player.update({
      where: { id: playerId },
      data,
      include: {
        team: {
          include: {
            club: true,
          },
        },
        tutors: true,
      },
    })
  }

  async remove(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
        role: 'ADMIN_CLUB',
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes permisos para eliminar este jugador')
    }

    return this.prisma.player.delete({
      where: { id: playerId },
    })
  }

  // ============================================
  // GESTIÓN DE TUTORES
  // ============================================

  async addTutor(userId: string, playerId: string, data: any) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          include: { club: true },
        },
      },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador')
    }

    let tutorUserId: string | undefined = undefined
    if (data.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: data.email },
      })
      if (existingUser) {
        tutorUserId = existingUser.id
      }
    }

    return this.prisma.playerTutor.create({
      data: {
        playerId,
        userId: tutorUserId,
        name: data.name,
        lastName: data.lastName,
        relationship: data.relationship,
        phone: data.phone,
        email: data.email,
        canPickUp: data.canPickUp ?? true,
        isEmergencyContact: data.isEmergencyContact ?? false,
      },
    })
  }

  async getTutors(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: {
          include: { club: true },
        },
        tutors: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                lastName: true,
              },
            },
          },
        },
      },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador')
    }

    return player.tutors
  }

  async updateTutor(userId: string, tutorId: string, data: any) {
    const tutor = await this.prisma.playerTutor.findUnique({
      where: { id: tutorId },
      include: {
        player: {
          include: {
            team: {
              include: { club: true },
            },
          },
        },
      },
    })

    if (!tutor) {
      throw new NotFoundException('Tutor no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: tutor.player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este tutor')
    }

    return this.prisma.playerTutor.update({
      where: { id: tutorId },
      data,
    })
  }

  async removeTutor(userId: string, tutorId: string) {
    const tutor = await this.prisma.playerTutor.findUnique({
      where: { id: tutorId },
      include: {
        player: {
          include: {
            team: {
              include: { club: true },
            },
          },
        },
      },
    })

    if (!tutor) {
      throw new NotFoundException('Tutor no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId: userId,
        clubId: tutor.player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este tutor')
    }

    return this.prisma.playerTutor.delete({
      where: { id: tutorId },
    })
  }
    // ============================================
  // JUGADORES DE MÚLTIPLES EQUIPOS
  // ============================================

  async findAllByTeams(userId: string, teamIds: string[]) {
    if (!teamIds || teamIds.length === 0) {
      return []
    }

    // Verificar acceso a cada equipo
    const teams = await this.prisma.team.findMany({
      where: { id: { in: teamIds } },
    })

    if (teams.length === 0) {
      throw new NotFoundException('No se encontraron equipos')
    }

    // Verificar que el usuario tiene acceso a todos los equipos
    const clubIds = [...new Set(teams.map(t => t.clubId))]

    for (const clubId of clubIds) {
      const member = await this.prisma.clubMember.findFirst({
        where: {
          userId: userId,
          clubId: clubId,
          isActive: true,
        },
      })

      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
      })

      const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

      if (!member && !isSuperAdmin) {
        throw new ForbiddenException('No tienes acceso a uno de los equipos seleccionados')
      }
    }

    return this.prisma.player.findMany({
      where: {
        teamId: { in: teamIds },
        isActive: true,
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        tutors: true,
      },
      orderBy: [
        { team: { name: 'asc' } },
        { number: 'asc' },
        { lastName: 'asc' },
      ],
    })
  }
    // ============================================
  // ESTADÍSTICAS DE PARTIDOS DEL JUGADOR
  // ============================================

  async getPlayerMatchStats(userId: string, playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: {
        team: { include: { club: true } },
      },
    })

    if (!player) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const member = await this.prisma.clubMember.findFirst({
      where: {
        userId,
        clubId: player.team.clubId,
        isActive: true,
      },
    })

    if (!member) {
      throw new ForbiddenException('No tienes acceso a este jugador')
    }

    // Todos los stats del jugador con la info del partido
    const stats = await this.prisma.matchPlayerStats.findMany({
      where: { playerId },
      include: {
        match: {
          select: {
            id: true,
            date: true,
            opponent: true,
            location: true,
            type: true,
            status: true,
            teamScore: true,
            opponentScore: true,
            competition: true,
          },
        },
      },
      orderBy: {
        match: { date: 'desc' },
      },
    })

    // Solo partidos finalizados para las agregaciones
    const finished = stats.filter(
      (s) =>
        s.match.status === 'FINISHED' &&
        s.match.teamScore !== null &&
        s.match.opponentScore !== null,
    )

    const games = finished.length

    // Totales
    const totals = finished.reduce(
      (acc, s) => ({
        minutes: acc.minutes + (s.minutes ?? 0),
        points: acc.points + s.points,
        rebounds: acc.rebounds + s.rebounds,
        assists: acc.assists + s.assists,
        steals: acc.steals + s.steals,
        blocks: acc.blocks + s.blocks,
        turnovers: acc.turnovers + s.turnovers,
        fouls: acc.fouls + s.fouls,
        fieldGoalsMade: acc.fieldGoalsMade + s.fieldGoalsMade,
        fieldGoalsAttempted: acc.fieldGoalsAttempted + s.fieldGoalsAttempted,
        threePointersMade: acc.threePointersMade + s.threePointersMade,
        threePointersAttempted: acc.threePointersAttempted + s.threePointersAttempted,
        freeThrowsMade: acc.freeThrowsMade + s.freeThrowsMade,
        freeThrowsAttempted: acc.freeThrowsAttempted + s.freeThrowsAttempted,
      }),
      {
        minutes: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0,
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 0,
        threePointersMade: 0,
        threePointersAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
      },
    )

    // Medias por partido
    const averages = {
      minutes: games ? +(totals.minutes / games).toFixed(1) : 0,
      points: games ? +(totals.points / games).toFixed(1) : 0,
      rebounds: games ? +(totals.rebounds / games).toFixed(1) : 0,
      assists: games ? +(totals.assists / games).toFixed(1) : 0,
      steals: games ? +(totals.steals / games).toFixed(1) : 0,
      blocks: games ? +(totals.blocks / games).toFixed(1) : 0,
      turnovers: games ? +(totals.turnovers / games).toFixed(1) : 0,
      fouls: games ? +(totals.fouls / games).toFixed(1) : 0,
    }

    // Porcentajes
    const percentages = {
      fieldGoals: totals.fieldGoalsAttempted
        ? Math.round((totals.fieldGoalsMade / totals.fieldGoalsAttempted) * 100)
        : 0,
      threePointers: totals.threePointersAttempted
        ? Math.round((totals.threePointersMade / totals.threePointersAttempted) * 100)
        : 0,
      freeThrows: totals.freeThrowsAttempted
        ? Math.round((totals.freeThrowsMade / totals.freeThrowsAttempted) * 100)
        : 0,
    }

    // Victorias/derrotas del jugador (cuando él ha jugado)
    const wins = finished.filter(
      (s) => (s.match.teamScore ?? 0) > (s.match.opponentScore ?? 0),
    ).length
    const losses = finished.filter(
      (s) => (s.match.teamScore ?? 0) < (s.match.opponentScore ?? 0),
    ).length

    return {
      player: {
        id: player.id,
        name: player.name,
        lastName: player.lastName,
        number: player.number,
        position: player.position,
      },
      summary: {
        gamesPlayed: games,
        wins,
        losses,
        winRate: games ? Math.round((wins / games) * 100) : 0,
        totals,
        averages,
        percentages,
      },
      // Ordenado del más antiguo al más nuevo para gráficas
      evolution: [...finished].reverse().map((s) => ({
        matchId: s.match.id,
        date: s.match.date,
        opponent: s.match.opponent,
        minutes: s.minutes ?? 0,
        points: s.points,
        rebounds: s.rebounds,
        assists: s.assists,
        steals: s.steals,
        blocks: s.blocks,
        turnovers: s.turnovers,
        fouls: s.fouls,
        teamScore: s.match.teamScore,
        opponentScore: s.match.opponentScore,
      })),
      // Todos los stats (incluye partidos no finalizados por si acaso)
      allGames: stats.map((s) => ({
        id: s.id,
        matchId: s.match.id,
        date: s.match.date,
        opponent: s.match.opponent,
        location: s.match.location,
        type: s.match.type,
        status: s.match.status,
        teamScore: s.match.teamScore,
        opponentScore: s.match.opponentScore,
        competition: s.match.competition,
        minutes: s.minutes,
        points: s.points,
        rebounds: s.rebounds,
        assists: s.assists,
        steals: s.steals,
        blocks: s.blocks,
        turnovers: s.turnovers,
        fouls: s.fouls,
        fieldGoalsMade: s.fieldGoalsMade,
        fieldGoalsAttempted: s.fieldGoalsAttempted,
        threePointersMade: s.threePointersMade,
        threePointersAttempted: s.threePointersAttempted,
        freeThrowsMade: s.freeThrowsMade,
        freeThrowsAttempted: s.freeThrowsAttempted,
      })),
    }
  }
}