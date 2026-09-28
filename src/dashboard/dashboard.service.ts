import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private async assertTeamAccess(userId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { club: true },
    })

    if (!team) {
      throw new NotFoundException('Equipo no encontrado')
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    const isSuperAdmin = user?.role === 'SUPER_ADMIN'
    if (isSuperAdmin) return team

    const isClubAdmin = await this.prisma.clubMember.findFirst({
      where: { userId, clubId: team.clubId, role: 'ADMIN_CLUB', isActive: true },
    })
    if (isClubAdmin) return team

    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId, teamId, status: 'ACTIVE' },
    })
    if (membership) return team

    throw new ForbiddenException('No tienes acceso a este equipo')
  }

  async getTeamSummary(userId: string, teamId: string) {
    const team = await this.assertTeamAccess(userId, teamId)
    const now = new Date()

    const [
      nextTraining,
      nextMatch,
      attendanceStats,
      totalSessions,
      topPlayersRaw,
      pendingCallupsRaw,
      matchBalanceRaw,
    ] = await Promise.all([
      // 1) Próximo entrenamiento
      this.prisma.session.findFirst({
        where: { teamId, date: { gte: now } },
        orderBy: { date: 'asc' },
        select: { id: true, title: true, date: true, duration: true, location: true },
      }),

      // 2) Próximo partido
      this.prisma.match.findFirst({
        where: { teamId, date: { gte: now }, status: 'SCHEDULED' },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          opponent: true,
          date: true,
          location: true,
          venue: true,
          competition: true,
        },
      }),

      // 3) Asistencia total del equipo
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { session: { teamId } },
        _count: { _all: true },
      }),

      // 4) Total de entrenamientos
      this.prisma.session.count({ where: { teamId } }),

      // 5) Top jugadores — ✅ ahora agrupamos por userId
      this.prisma.matchPlayerStats.groupBy({
        by: ['userId'],
        where: {
          match: { teamId, status: 'FINISHED' },
        },
        _sum: { points: true, rebounds: true, assists: true },
        _count: { _all: true },
        orderBy: { _sum: { points: 'desc' } },
        take: 5,
      }),

      // 6) Convocatorias pendientes
      this.prisma.matchCallup.groupBy({
        by: ['matchId'],
        where: {
          status: 'PENDING',
          match: { teamId, date: { gte: now }, status: 'SCHEDULED' },
        },
        _count: { _all: true },
      }),

      // 7) Balance de partidos
      this.prisma.match.findMany({
        where: { teamId, status: 'FINISHED' },
        select: { teamScore: true, opponentScore: true, date: true },
        orderBy: { date: 'desc' },
      }),
    ])

    // --- Procesar asistencia ---
    const attendanceCounts = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    }
    for (const row of attendanceStats) {
      const key = row.status.toLowerCase() as keyof typeof attendanceCounts
      attendanceCounts[key] = row._count._all
    }
    const totalAttendance =
      attendanceCounts.present +
      attendanceCounts.absent +
      attendanceCounts.late +
      attendanceCounts.excused

    const rate =
      totalAttendance > 0
        ? Math.round(
            ((attendanceCounts.present + attendanceCounts.late) / totalAttendance) * 100,
          )
        : 0

    // --- Procesar top jugadores ---
    // ✅ Ahora buscamos Users en lugar de Players
    const userIds = topPlayersRaw.map((p) => p.userId)
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        lastName: true,
        username: true,
        isGhost: true,
      },
    })
    const usersMap = new Map(users.map((u) => [u.id, u]))

    // ✅ Necesitamos el jersey number del membership activo en este equipo
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        userId: { in: userIds },
        teamId,
        roles: { some: { role: 'PLAYER' } },
        status: 'ACTIVE',
      },
      select: { userId: true, jerseyNumber: true },
    })
    const jerseyMap = new Map(memberships.map((m) => [m.userId, m.jerseyNumber]))

    const topPlayers = topPlayersRaw.map((row) => {
      const user = usersMap.get(row.userId)
      const games = row._count._all
      const points = row._sum.points ?? 0
      const rebounds = row._sum.rebounds ?? 0
      const assists = row._sum.assists ?? 0
      return {
        id: row.userId,
        name: user ? `${user.name} ${user.lastName}` : 'Desconocido',
        username: user?.username ?? null,
        isGhost: user?.isGhost ?? false,
        number: jerseyMap.get(row.userId) ?? null,
        gamesPlayed: games,
        totalPoints: points,
        totalRebounds: rebounds,
        totalAssists: assists,
        avgPoints: games ? +(points / games).toFixed(1) : 0,
        avgRebounds: games ? +(rebounds / games).toFixed(1) : 0,
        avgAssists: games ? +(assists / games).toFixed(1) : 0,
      }
    })

    // --- Procesar convocatorias pendientes ---
    const matchIds = pendingCallupsRaw.map((c) => c.matchId)
    const pendingMatches = await this.prisma.match.findMany({
      where: { id: { in: matchIds } },
      select: { id: true, opponent: true, date: true, venue: true },
    })
    const matchesMap = new Map(pendingMatches.map((m) => [m.id, m]))

    const pendingCallups = pendingCallupsRaw
      .map((row) => {
        const match = matchesMap.get(row.matchId)
        if (!match) return null
        return {
          matchId: row.matchId,
          opponent: match.opponent,
          date: match.date,
          venue: match.venue,
          pendingCount: row._count._all,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // --- Procesar balance ---
    const finished = matchBalanceRaw.filter(
      (m) => m.teamScore !== null && m.opponentScore !== null,
    )
    const wins = finished.filter((m) => (m.teamScore ?? 0) > (m.opponentScore ?? 0)).length
    const losses = finished.filter((m) => (m.teamScore ?? 0) < (m.opponentScore ?? 0)).length
    const draws = finished.length - wins - losses
    const winRate = finished.length ? Math.round((wins / finished.length) * 100) : 0
    const last5 = finished.slice(0, 5).map((m) =>
      (m.teamScore ?? 0) > (m.opponentScore ?? 0)
        ? 'W'
        : (m.teamScore ?? 0) < (m.opponentScore ?? 0)
        ? 'L'
        : 'D',
    )

    return {
      team: {
        id: team.id,
        name: team.name,
        category: team.category,
        season: team.season,
        club: {
          id: team.club.id,
          name: team.club.name,
        },
      },
      nextTraining,
      nextMatch,
      attendance: {
        rate,
        totalSessions,
        ...attendanceCounts,
      },
      topPlayers,
      pendingCallups,
      matchBalance: {
        wins,
        losses,
        draws,
        winRate,
        last5,
        totalPlayed: finished.length,
      },
    }
  }
}