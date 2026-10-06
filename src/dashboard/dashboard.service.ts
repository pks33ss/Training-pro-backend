import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { getTeamForViewer } from '../common/access'

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getTeamSummary(userId: string, teamId: string) {
    const team = await getTeamForViewer(this.prisma, userId, teamId)
    const now = new Date()

    const [
      nextTraining,
      nextMatch,
      attendanceStats,
      totalSessions,
      pendingCallupsRaw,
      matchBalanceRaw,
    ] = await Promise.all([
      // 1) Próximo entrenamiento
      this.prisma.session.findFirst({
        where: { teamId, date: { gte: now } },
        orderBy: { date: 'asc' },
        select: {
          id: true,
          title: true,
          date: true,
          duration: true,
          location: true,
        },
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

      // 5) Convocatorias pendientes
      this.prisma.matchCallup.groupBy({
        by: ['matchId'],
        where: {
          status: 'PENDING',
          match: { teamId, date: { gte: now }, status: 'SCHEDULED' },
        },
        _count: { _all: true },
      }),

      // 6) Balance de partidos
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
            ((attendanceCounts.present + attendanceCounts.late) /
              totalAttendance) *
              100,
          )
        : 0

    // --- Procesar top jugadores (según deporte) ---
    let topPlayers: any[] = []
    let topPlayersMetrics: Array<{ key: string; label: string }> = []
    let defaultTopPlayersMetric = 'matchesPlayed'

    if (team.sport === 'BASKETBALL') {
      const stats = await this.prisma.matchPlayerStats.findMany({
        where: {
          match: { teamId, status: 'FINISHED' },
        },
        select: {
          userId: true,
          points: true,
          rebounds: true,
          assists: true,
          match: { select: { teamScore: true, opponentScore: true } },
        },
      })

      type Acc = {
        userId: string
        matchesPlayed: number
        wins: number
        points: number
        rebounds: number
        assists: number
      }
      const accMap = new Map<string, Acc>()

      for (const s of stats) {
        if (!accMap.has(s.userId)) {
          accMap.set(s.userId, {
            userId: s.userId,
            matchesPlayed: 0,
            wins: 0,
            points: 0,
            rebounds: 0,
            assists: 0,
          })
        }
        const a = accMap.get(s.userId)!
        a.matchesPlayed++
        a.points += s.points
        a.rebounds += s.rebounds
        a.assists += s.assists
        if (
          s.match.teamScore !== null &&
          s.match.opponentScore !== null &&
          s.match.teamScore > s.match.opponentScore
        ) {
          a.wins++
        }
      }

      const userIds = Array.from(accMap.keys())
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

      const memberships = await this.prisma.teamMembership.findMany({
        where: {
          userId: { in: userIds },
          teamId,
          roles: { some: { role: 'PLAYER' } },
          status: 'ACTIVE',
        },
        select: { userId: true, jerseyNumber: true },
      })
      const jerseyMap = new Map(
        memberships.map((m) => [m.userId, m.jerseyNumber]),
      )

      topPlayers = userIds.map((uid) => {
        const a = accMap.get(uid)!
        const u = usersMap.get(uid)
        return {
          id: uid,
          name: u ? `${u.name} ${u.lastName}` : 'Desconocido',
          username: u?.username ?? null,
          isGhost: u?.isGhost ?? false,
          number: jerseyMap.get(uid) ?? null,
          metrics: {
            matchesPlayed: a.matchesPlayed,
            wins: a.wins,
            points: a.points,
            rebounds: a.rebounds,
            assists: a.assists,
          },
        }
      })

      topPlayersMetrics = [
        { key: 'points', label: 'Puntos' },
        { key: 'rebounds', label: 'Rebotes' },
        { key: 'assists', label: 'Asistencias' },
        { key: 'matchesPlayed', label: 'Partidos jugados' },
      ]
      defaultTopPlayersMetric = 'points'
    } else if (team.sport === 'PADEL') {
      const matches = await this.prisma.match.findMany({
        where: { teamId, status: 'FINISHED' },
        select: {
          teamScore: true,
          opponentScore: true,
          location: true,
          padelSubMatches: {
            select: {
              player1Id: true,
              player2Id: true,
              sets: {
                select: {
                  homeScore: true,
                  awayScore: true,
                },
              },
            },
          },
        },
      })

      type Acc = {
        userId: string
        matchesPlayed: number
        wins: number
        subMatchesWon: number
        setsWon: number
      }
      const accMap = new Map<string, Acc>()

      const ensure = (uid: string) => {
        if (!accMap.has(uid)) {
          accMap.set(uid, {
            userId: uid,
            matchesPlayed: 0,
            wins: 0,
            subMatchesWon: 0,
            setsWon: 0,
          })
        }
        return accMap.get(uid)!
      }

      for (const m of matches) {
        const isWin =
          m.teamScore !== null &&
          m.opponentScore !== null &&
          m.teamScore > m.opponentScore
        const isAway = m.location === 'AWAY'

        const playersInMatch = new Set<string>()

        for (const sm of m.padelSubMatches) {
          const players = [sm.player1Id, sm.player2Id].filter(
            (x): x is string => !!x,
          )
          for (const uid of players) playersInMatch.add(uid)

          let oursSets = 0
          let theirsSets = 0

          for (const s of sm.sets) {
            const ours = isAway ? s.awayScore : s.homeScore
            const theirs = isAway ? s.homeScore : s.awayScore
            if (ours > theirs) {
              oursSets++
              for (const uid of players) ensure(uid).setsWon++
            } else if (theirs > ours) {
              theirsSets++
            }
          }

          if (oursSets > theirsSets) {
            for (const uid of players) ensure(uid).subMatchesWon++
          }
        }

        for (const uid of playersInMatch) {
          const a = ensure(uid)
          a.matchesPlayed++
          if (isWin) a.wins++
        }
      }

      const userIds = Array.from(accMap.keys())
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

      const memberships = await this.prisma.teamMembership.findMany({
        where: {
          userId: { in: userIds },
          teamId,
          roles: { some: { role: 'PLAYER' } },
          status: 'ACTIVE',
        },
        select: { userId: true, jerseyNumber: true },
      })
      const jerseyMap = new Map(
        memberships.map((m) => [m.userId, m.jerseyNumber]),
      )

      topPlayers = userIds.map((uid) => {
        const a = accMap.get(uid)!
        const u = usersMap.get(uid)
        return {
          id: uid,
          name: u ? `${u.name} ${u.lastName}` : 'Desconocido',
          username: u?.username ?? null,
          isGhost: u?.isGhost ?? false,
          number: jerseyMap.get(uid) ?? null,
          metrics: {
            matchesPlayed: a.matchesPlayed,
            wins: a.wins,
            subMatchesWon: a.subMatchesWon,
            setsWon: a.setsWon,
          },
        }
      })

      topPlayersMetrics = [
        { key: 'wins', label: 'Victorias' },
        { key: 'subMatchesWon', label: 'Pistas ganadas' },
        { key: 'setsWon', label: 'Sets ganados' },
        { key: 'matchesPlayed', label: 'Partidos jugados' },
      ]
      defaultTopPlayersMetric = 'wins'
    }

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
    const wins = finished.filter(
      (m) => (m.teamScore ?? 0) > (m.opponentScore ?? 0),
    ).length
    const losses = finished.filter(
      (m) => (m.teamScore ?? 0) < (m.opponentScore ?? 0),
    ).length
    const draws = finished.length - wins - losses
    const winRate = finished.length
      ? Math.round((wins / finished.length) * 100)
      : 0
    const last5 = finished
      .slice(0, 5)
      .map((m) =>
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
      topPlayersMetrics,
      defaultTopPlayersMetric,
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