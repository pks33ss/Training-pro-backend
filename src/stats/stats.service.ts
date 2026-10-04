import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  getTeamsForViewer,
  resolveViewerStatsRole,
} from '../common/access'
import { TeamStatsQueryDto } from './dto/team-stats-query.dto'
import { computePadelStatsFromMatch } from './padel-stats.helper'
import { BasketballStatsService } from './basketball-stats.service'
import { buildVisibleKeys, filterStatsPayload } from './stats-filter'

const USER_SELECT = {
  id: true,
  name: true,
  lastName: true,
  username: true,
  avatar: true,
  email: true,
  isGhost: true,
} as const

type MatchResult = 'WIN' | 'LOSS' | 'DRAW'

@Injectable()
export class TeamStatsService {
  constructor(
    private prisma: PrismaService,
    private basketballStats: BasketballStatsService,
  ) {}

  async getTeamStats(userId: string, teamId: string, query: TeamStatsQueryDto) {
    const additionalIds = (query.teamIds ?? []).filter((id) => id !== teamId)
    const allIds = [teamId, ...additionalIds]

    const teams = await getTeamsForViewer(this.prisma, userId, allIds)
    const mainTeam = teams[0]
    const teamIds = teams.map((t) => t.id)

    const range = await this.resolveDateRange(mainTeam.id, query)

    // Config de visibilidad + rol del viewer (para filtrar el payload)
    const viewerRole = await resolveViewerStatsRole(
      this.prisma,
      userId,
      mainTeam.id,
    )
    const configRows = await this.prisma.statsVisibilityConfig.findMany({
      where: { teamId: mainTeam.id, sport: mainTeam.sport },
    })
    const visibleTeamKeys = buildVisibleKeys(
      mainTeam.sport,
      'TEAM',
      viewerRole,
      configRows as any,
    )

    if (mainTeam.sport === 'PADEL') {
      const matches = await this.fetchPadelMatches(teamIds, range, query)
      return this.buildPadelResponse(teams, query, matches, visibleTeamKeys)
    }

    if (mainTeam.sport === 'BASKETBALL') {
      const matches = await this.fetchBasketballMatches(teamIds, range, query)
      const payload = this.basketballStats.buildTeamStats(
        teams.map((t) => ({ id: t.id, name: t.name, sport: t.sport })),
        query,
        matches as any,
      )
            const visibleMetrics = filterStatsPayload(
        mainTeam.sport,
        visibleTeamKeys,
        payload.sport.data as any,
      )
      return {
        ...payload,
        visibleMetrics: Array.from(visibleMetrics),
      }
    }

    return {
      teams: teams.map((t) => ({ id: t.id, name: t.name, sport: t.sport })),
      team: { id: mainTeam.id, name: mainTeam.name, sport: mainTeam.sport },
      filters: {
        seasonId: query.seasonId ?? null,
        from: range.from?.toISOString() ?? null,
        to: range.to?.toISOString() ?? null,
        playerId: query.playerId ?? null,
        matchIds: query.matchIds ?? null,
        teamIds,
      },
      sport: {
        type: mainTeam.sport,
        data: null,
      },
    }
  }

  private async resolveDateRange(
    teamId: string,
    query: TeamStatsQueryDto,
  ): Promise<{ from: Date | null; to: Date | null }> {
    let from: Date | null = null
    let to: Date | null = null

    if (query.seasonId) {
      const season = await this.prisma.season.findFirst({
        where: { id: query.seasonId, teamId },
        select: { id: true, startDate: true, endDate: true },
      })
      if (!season) {
        throw new NotFoundException('Temporada no encontrada para este equipo')
      }
      if (season.startDate) from = season.startDate
      if (season.endDate) {
        const end = new Date(season.endDate)
        end.setUTCHours(23, 59, 59, 999)
        to = end
      }
    }

    if (query.from) {
      const qf = new Date(query.from)
      if (!from || qf > from) from = qf
    }
    if (query.to) {
      const qt = new Date(query.to)
      qt.setUTCHours(23, 59, 59, 999)
      if (!to || qt < to) to = qt
    }

    return { from, to }
  }

  private buildBaseWhere(
    teamIds: string[],
    range: { from: Date | null; to: Date | null },
    matchIds?: string[],
  ) {
    const where: any = { teamId: { in: teamIds }, status: 'FINISHED' }

    if (range.from || range.to) {
      where.date = {}
      if (range.from) where.date.gte = range.from
      if (range.to) where.date.lte = range.to
    }

    if (matchIds && matchIds.length > 0) {
      where.id = { in: matchIds }
    }

    return where
  }

  private async fetchPadelMatches(
    teamIds: string[],
    range: { from: Date | null; to: Date | null },
    query: TeamStatsQueryDto,
  ) {
    const where = this.buildBaseWhere(teamIds, range, query.matchIds)

    if (query.playerId) {
      where.padelSubMatches = {
        some: {
          OR: [{ player1Id: query.playerId }, { player2Id: query.playerId }],
        },
      }
    }

    return this.prisma.match.findMany({
      where,
      orderBy: { date: 'asc' },
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
          select: {
            userId: true,
            availableStatus: true,
            user: { select: USER_SELECT },
          },
        },
      },
    })
  }

  private async fetchBasketballMatches(
    teamIds: string[],
    range: { from: Date | null; to: Date | null },
    query: TeamStatsQueryDto,
  ) {
    const where = this.buildBaseWhere(teamIds, range, query.matchIds)

    if (query.playerId) {
      where.playerStats = {
        some: { userId: query.playerId },
      }
    }

    return this.prisma.match.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        playerStats: {
          include: {
            user: { select: USER_SELECT },
          },
        },
        callups: {
          select: {
            userId: true,
            availableStatus: true,
            user: { select: USER_SELECT },
          },
        },
      },
    })
  }

  // ─────────────────────────────────────────────
  // PÁDEL — agregado
  // ─────────────────────────────────────────────

  private buildPadelResponse(
    teams: Array<{ id: string; name: string; sport: string }>,
    query: TeamStatsQueryDto,
    matches: Awaited<ReturnType<TeamStatsService['fetchPadelMatches']>>,
    visibleTeamKeys: Set<string>,
  ) {
    const mainTeam = teams[0]

    const perMatch = matches.map((m) =>
      computePadelStatsFromMatch({
        id: m.id,
        teamId: m.teamId,
        date: m.date,
        opponent: m.opponent,
        location: m.location as any,
        teamScore: m.teamScore,
        opponentScore: m.opponentScore,
        padelSubMatches: m.padelSubMatches.map((sm) => ({
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
      }),
    )

    let matchesCount = 0
    let wins = 0
    let losses = 0
    let draws = 0

    let subMatchesPlayed = 0
    let subMatchesWon = 0
    let subMatchesLost = 0
    let subMatchesDrawn = 0

    let setsPlayed = 0
    let setsWon = 0
    let setsLost = 0
    let setsDrawn = 0

    let gamesWon = 0
    let gamesLost = 0

    for (const pm of perMatch) {
      const ts = pm.teamSummary
      matchesCount++
      if (ts.result === 'WIN') wins++
      else if (ts.result === 'LOSS') losses++
      else if (ts.result === 'DRAW') draws++

      subMatchesPlayed += ts.subMatchesPlayed
      subMatchesWon += ts.subMatchesWon
      subMatchesLost += ts.subMatchesLost
      subMatchesDrawn += ts.subMatchesDrawn

      setsPlayed += ts.setsPlayed
      setsWon += ts.setsWon
      setsLost += ts.setsLost
      setsDrawn += ts.setsDrawn

      gamesWon += ts.gamesWon
      gamesLost += ts.gamesLost
    }

    const winRate =
      wins + losses + draws > 0
        ? Math.round((wins / (wins + losses + draws)) * 1000) / 10
        : 0

    const summary = {
      matches: matchesCount,
      wins,
      losses,
      draws,
      winRate,
      subMatchesPlayed,
      subMatchesWon,
      subMatchesLost,
      subMatchesDrawn,
      setsPlayed,
      setsWon,
      setsLost,
      setsDrawn,
      gamesWon,
      gamesLost,
      gamesDiff: gamesWon - gamesLost,
    }

    type PlayerAgg = {
      userId: string
      name: string
      lastName: string
      matches: number
      wins: number
      losses: number
      draws: number
      availabilityCount: number
      teamMatches: number
      subMatchesPlayed: number
      subMatchesWon: number
      subMatchesLost: number
      subMatchesDrawn: number
      setsPlayed: number
      setsWon: number
      setsLost: number
      setsDrawn: number
      gamesWon: number
      gamesLost: number
    }

    const playersMap = new Map<string, PlayerAgg>()

    const ensurePlayer = (u: { id: string; name: string; lastName: string }) => {
      if (!playersMap.has(u.id)) {
        playersMap.set(u.id, {
          userId: u.id,
          name: u.name,
          lastName: u.lastName,
          matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          availabilityCount: 0,
          teamMatches: matchesCount,
          subMatchesPlayed: 0,
          subMatchesWon: 0,
          subMatchesLost: 0,
          subMatchesDrawn: 0,
          setsPlayed: 0,
          setsWon: 0,
          setsLost: 0,
          setsDrawn: 0,
          gamesWon: 0,
          gamesLost: 0,
        })
      }
      return playersMap.get(u.id)!
    }

    for (let i = 0; i < perMatch.length; i++) {
      const pm = perMatch[i]
      const match = matches[i]
      const matchResult = pm.match.result

      const availabilityByUser = new Map<string, string>()
      for (const c of match.callups ?? []) {
        availabilityByUser.set(c.userId, c.availableStatus)
      }

      const participants = new Set<string>()
      for (const sm of pm.subMatches) {
        if (sm.player1) participants.add(sm.player1.id)
        if (sm.player2) participants.add(sm.player2.id)
      }

      // Pase 1: jugadores que jugaron pista
      for (const p of pm.players) {
        if (!participants.has(p.userId)) continue

        const agg = ensurePlayer({
          id: p.userId,
          name: p.name,
          lastName: p.lastName,
        })

        agg.matches++
        if (matchResult === 'WIN') agg.wins++
        else if (matchResult === 'LOSS') agg.losses++
        else if (matchResult === 'DRAW') agg.draws++

        if (availabilityByUser.get(p.userId) === 'YES') {
          agg.availabilityCount++
        }

        agg.subMatchesPlayed += p.subMatchesPlayed
        agg.subMatchesWon += p.subMatchesWon
        agg.subMatchesLost += p.subMatchesLost
        agg.subMatchesDrawn += p.subMatchesDrawn

        agg.setsPlayed += p.setsPlayed
        agg.setsWon += p.setsWon
        agg.setsLost += p.setsLost
        agg.setsDrawn += p.setsDrawn

        agg.gamesWon += p.gamesWon
        agg.gamesLost += p.gamesLost
      }

      // Pase 2: cualquier jugador con callup (no jugó pista)
      for (const c of match.callups ?? []) {
        if (participants.has(c.userId)) continue

        const agg = ensurePlayer({
          id: c.user.id,
          name: c.user.name,
          lastName: c.user.lastName,
        })
        if (c.availableStatus === 'YES') {
          agg.availabilityCount++
        }
      }
    }

    const players = Array.from(playersMap.values())
      .map((p) => ({
        ...p,
        winRate:
          p.matches > 0
            ? Math.round((p.wins / p.matches) * 1000) / 10
            : 0,
        gamesDiff: p.gamesWon - p.gamesLost,
      }))
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate
        return b.gamesDiff - a.gamesDiff
      })

    const byMonthMap = new Map<
      string,
      { matches: number; wins: number; losses: number; draws: number }
    >()

    for (const pm of perMatch) {
      const d = pm.match.date
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      if (!byMonthMap.has(key)) {
        byMonthMap.set(key, { matches: 0, wins: 0, losses: 0, draws: 0 })
      }
      const b = byMonthMap.get(key)!
      b.matches++
      if (pm.match.result === 'WIN') b.wins++
      else if (pm.match.result === 'LOSS') b.losses++
      else if (pm.match.result === 'DRAW') b.draws++
    }

    const byMonth = Array.from(byMonthMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, v]) => ({
        month,
        matches: v.matches,
        wins: v.wins,
        losses: v.losses,
        draws: v.draws,
        winRate:
          v.matches > 0
            ? Math.round((v.wins / v.matches) * 1000) / 10
            : 0,
      }))

    const last10ByMatch = perMatch.slice(-10).map((pm) => ({
      matchId: pm.match.id,
      date: pm.match.date.toISOString(),
      opponent: pm.match.opponent,
      result: pm.match.result as MatchResult | null,
    }))

    const allSubMatches: {
      subMatchId: string
      matchId: string
      date: string
      opponent: string
      order: number
      result: MatchResult | null
    }[] = []

    for (const pm of perMatch) {
      for (const sm of pm.subMatches) {
        if (sm.result === null) continue
        allSubMatches.push({
          subMatchId: sm.id,
          matchId: pm.match.id,
          date: pm.match.date.toISOString(),
          opponent: pm.match.opponent,
          order: sm.order,
          result: sm.result,
        })
      }
    }
    const last10BySubMatch = allSubMatches.slice(-10)

    const response = {
      teams: teams.map((t) => ({ id: t.id, name: t.name, sport: t.sport })),
      team: { id: mainTeam.id, name: mainTeam.name, sport: mainTeam.sport },
      filters: {
        seasonId: query.seasonId ?? null,
        from:
          perMatch.length > 0
            ? perMatch[0].match.date.toISOString()
            : query.from ?? null,
        to:
          perMatch.length > 0
            ? perMatch[perMatch.length - 1].match.date.toISOString()
            : query.to ?? null,
        playerId: query.playerId ?? null,
        matchIds: query.matchIds ?? null,
        teamIds: teams.map((t) => t.id),
      },
      sport: {
        type: 'PADEL' as const,
        data: {
          summary,
          players,
          trend: {
            byMonth,
            last10ByMatch,
            last10BySubMatch,
          },
        },
      },
    }

        const visibleMetrics = filterStatsPayload(
      mainTeam.sport,
      visibleTeamKeys,
      response.sport.data as any,
    )

    return {
      ...response,
      visibleMetrics: Array.from(visibleMetrics),
    }
  }
}