import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  getTeamsForViewer,
  resolveViewerStatsRole,
  canViewTeam,
} from '../common/access'
import { TeamStatsQueryDto } from './dto/team-stats-query.dto'
import { PlayerStatsQueryDto } from './dto/player-stats-query.dto'
import { computePadelStatsFromMatch } from './padel-stats.helper'
import {
  computeBasketballStatsFromMatch,
  computeValuation,
  pct,
  perMatch as perMatchAvg,
} from './basketball-stats.helper'
import { BasketballStatsService } from './basketball-stats.service'
import {
  buildVisibleKeys,
  filterStatsPayload,
  getAvailableTrendMetrics,
} from './stats-filter'
import { findTrendMetric } from './metric-registry'
import { buildMonthlySeries, TrendMatchInput } from './trend.helper'

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
    // Selección efectiva de equipos:
    // - Si el viewer manda teamIds explícitos, se usan esos (sustituyen).
    // - Si no, se usa el equipo activo del path.
    const explicitTeamIds = (query.teamIds ?? []).filter(Boolean)
    const effectiveTeamIds =
      explicitTeamIds.length > 0 ? explicitTeamIds : [teamId]

    const teams = await getTeamsForViewer(
      this.prisma,
      userId,
      effectiveTeamIds,
    )
    const mainTeam = teams[0]
    const teamIds = teams.map((t) => t.id)

    // El rango de fechas se resuelve contra el teamId del path (el activo),
    // porque las seasons pertenecen al equipo activo aunque el usuario
    // haya cambiado la selección de equipos.
    const range = await this.resolveDateRange(teamId, query)

    // Rol del viewer y config de visibilidad: SIEMPRE con el teamId del path.
    const viewerRole = await resolveViewerStatsRole(
      this.prisma,
      userId,
      teamId,
    )
    const configRows = await this.prisma.statsVisibilityConfig.findMany({
      where: { teamId, sport: mainTeam.sport },
    })
    const visibleTeamKeys = buildVisibleKeys(
      mainTeam.sport,
      'TEAM',
      viewerRole,
      configRows as any,
    )

    const availableTrendMetrics = getAvailableTrendMetrics(
      mainTeam.sport,
      'TEAM',
      visibleTeamKeys,
    ).map((m) => ({
      key: m.trendKey!,
      label: m.trendLabel!,
      unit: m.unit!,
    }))

    if (mainTeam.sport === 'PADEL') {
      const matches = await this.fetchPadelMatches(teamIds, range, query)
      return this.buildPadelResponse(
        teams,
        query,
        matches,
        visibleTeamKeys,
        availableTrendMetrics,
      )
    }

    if (mainTeam.sport === 'BASKETBALL') {
      const matches = await this.fetchBasketballMatches(teamIds, range, query)
      const payload = this.basketballStats.buildTeamStats(
        teams.map((t) => ({ id: t.id, name: t.name, sport: t.sport })),
        query,
        matches as any,
      )

      const requestedMetric = query.trendMetric ?? null
      const isRequestedAvailable =
        requestedMetric === null ||
        availableTrendMetrics.some((m) => m.key === requestedMetric)
      if (!isRequestedAvailable) {
        payload.sport.data.trend.series = null
        payload.sport.data.trend.appliedMetric = null
      }

      const visibleMetrics = filterStatsPayload(
        mainTeam.sport,
        visibleTeamKeys,
        payload.sport.data as any,
      )

      return {
        ...payload,
        visibleMetrics: Array.from(visibleMetrics),
        availableTrendMetrics,
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
      availableTrendMetrics,
    }
  }

  // ─────────────────────────────────────────────
  // FASE 3.4 — Stats individuales de jugador
  // ─────────────────────────────────────────────

  async getPlayerStats(
    viewerId: string,
    teamId: string,
    playerUserId: string,
    query: PlayerStatsQueryDto,
  ) {
    // Selección efectiva de equipos (mismo criterio que en getTeamStats).
    const explicitTeamIds = (query.teamIds ?? []).filter(Boolean)
    const effectiveTeamIds =
      explicitTeamIds.length > 0 ? explicitTeamIds : [teamId]

    const teams = await getTeamsForViewer(
      this.prisma,
      viewerId,
      effectiveTeamIds,
    )
    const mainTeam = teams[0]
    const teamIds = teams.map((t) => t.id)

    const player = await this.prisma.user.findUnique({
      where: { id: playerUserId },
      select: { id: true, name: true, lastName: true, deletedAt: true },
    })
    if (!player || player.deletedAt) {
      throw new NotFoundException('Jugador no encontrado')
    }

    // Rango y rol: con el teamId del path.
    const range = await this.resolveDateRange(teamId, query)

    const viewerRole = await resolveViewerStatsRole(
      this.prisma,
      viewerId,
      teamId,
    )
    const configRows = await this.prisma.statsVisibilityConfig.findMany({
      where: { teamId, sport: mainTeam.sport },
    })
    const visiblePlayerKeys = buildVisibleKeys(
      mainTeam.sport,
      'PLAYER',
      viewerRole,
      configRows as any,
    )

    const availableTrendMetrics = getAvailableTrendMetrics(
      mainTeam.sport,
      'PLAYER',
      visiblePlayerKeys,
    ).map((m) => ({
      key: m.trendKey!,
      label: m.trendLabel!,
      unit: m.unit!,
    }))

    if (mainTeam.sport === 'PADEL') {
      const matches = await this.fetchPadelMatchesForPlayer(
        teamIds,
        range,
        playerUserId,
        query,
      )
      return this.buildPadelPlayerResponse(
        teams,
        player,
        query,
        matches,
        playerUserId,
        visiblePlayerKeys,
        availableTrendMetrics,
      )
    }

    if (mainTeam.sport === 'BASKETBALL') {
      const matches = await this.fetchBasketballMatchesForPlayer(
        teamIds,
        range,
        playerUserId,
        query,
      )
      return this.buildBasketballPlayerResponse(
        teams,
        player,
        query,
        matches,
        playerUserId,
        visiblePlayerKeys,
        availableTrendMetrics,
      )
    }

    return {
      team: { id: mainTeam.id, name: mainTeam.name, sport: mainTeam.sport },
      player: {
        userId: player.id,
        name: player.name,
        lastName: player.lastName,
      },
      filters: {
        seasonId: query.seasonId ?? null,
        from: range.from?.toISOString() ?? null,
        to: range.to?.toISOString() ?? null,
        matchIds: query.matchIds ?? null,
        teamIds,
      },
      summary: null,
      byMatch: [],
      trend: {
        byMonth: [],
        series: null,
        requestedMetric: query.trendMetric ?? null,
        appliedMetric: null,
      },
      visibleMetrics: [],
      availableTrendMetrics,
    }
  }

  private async fetchPadelMatchesForPlayer(
    teamIds: string[],
    range: { from: Date | null; to: Date | null },
    playerUserId: string,
    query: PlayerStatsQueryDto,
  ) {
    const where = this.buildBaseWhere(teamIds, range, query.matchIds)
    where.padelSubMatches = {
      some: {
        OR: [{ player1Id: playerUserId }, { player2Id: playerUserId }],
      },
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

  private async fetchBasketballMatchesForPlayer(
    teamIds: string[],
    range: { from: Date | null; to: Date | null },
    playerUserId: string,
    query: PlayerStatsQueryDto,
  ) {
    const where = this.buildBaseWhere(teamIds, range, query.matchIds)
    where.playerStats = { some: { userId: playerUserId } }

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
  // PÁDEL — respuesta individual de jugador
  // ─────────────────────────────────────────────

  private buildPadelPlayerResponse(
    teams: Array<{ id: string; name: string; sport: string }>,
    player: { id: string; name: string; lastName: string },
    query: PlayerStatsQueryDto,
    matches: Awaited<ReturnType<TeamStatsService['fetchPadelMatchesForPlayer']>>,
    playerUserId: string,
    visiblePlayerKeys: Set<string>,
    availableTrendMetrics: Array<{ key: string; label: string; unit: string }>,
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
      }),
    )

    let matchesCount = 0
    let wins = 0
    let losses = 0
    let draws = 0
    let availabilityCount = 0
    let teamMatches = 0

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

    const byMatch: Array<Record<string, any>> = []

    for (let i = 0; i < perMatch.length; i++) {
      const pm = perMatch[i]
      const rawMatch = matches[i]
      teamMatches++

      const availability = rawMatch.callups?.find(
        (c) => c.userId === playerUserId,
      )?.availableStatus
      if (availability === 'YES') availabilityCount++

      const playerSubMatches = pm.subMatches.filter(
        (sm) =>
          sm.player1?.id === playerUserId ||
          sm.player2?.id === playerUserId,
      )

      if (playerSubMatches.length === 0) {
        continue
      }

      const matchResult = pm.match.result

      let pmSubPlayed = 0
      let pmSubWon = 0
      let pmSubLost = 0
      let pmSubDrawn = 0
      let pmSetsWon = 0
      let pmSetsLost = 0
      let pmSetsDrawn = 0
      let pmGamesWon = 0
      let pmGamesLost = 0

      for (const sm of playerSubMatches) {
        if (sm.result === null) continue
        pmSubPlayed++
        if (sm.result === 'WIN') pmSubWon++
        else if (sm.result === 'LOSS') pmSubLost++
        else pmSubDrawn++

        pmSetsWon += sm.setsWon
        pmSetsLost += sm.setsLost
        pmSetsDrawn += sm.setsDrawn
        pmGamesWon += sm.gamesWon
        pmGamesLost += sm.gamesLost
      }

      matchesCount++
      if (matchResult === 'WIN') wins++
      else if (matchResult === 'LOSS') losses++
      else if (matchResult === 'DRAW') draws++

      subMatchesPlayed += pmSubPlayed
      subMatchesWon += pmSubWon
      subMatchesLost += pmSubLost
      subMatchesDrawn += pmSubDrawn

      setsPlayed += pmSetsWon + pmSetsLost + pmSetsDrawn
      setsWon += pmSetsWon
      setsLost += pmSetsLost
      setsDrawn += pmSetsDrawn

      gamesWon += pmGamesWon
      gamesLost += pmGamesLost

      byMatch.push({
        matchId: pm.match.id,
        date: pm.match.date.toISOString(),
        opponent: pm.match.opponent,
        result: matchResult,
        teamScore: pm.match.teamScore,
        opponentScore: pm.match.opponentScore,
        matches: 1,
        wins: matchResult === 'WIN' ? 1 : 0,
        losses: matchResult === 'LOSS' ? 1 : 0,
        draws: matchResult === 'DRAW' ? 1 : 0,
        availabilityCount: availability === 'YES' ? 1 : 0,
        subMatchesPlayed: pmSubPlayed,
        subMatchesWon: pmSubWon,
        subMatchesLost: pmSubLost,
        subMatchesDrawn: pmSubDrawn,
        setsPlayed: pmSetsWon + pmSetsLost + pmSetsDrawn,
        setsWon: pmSetsWon,
        setsLost: pmSetsLost,
        setsDrawn: pmSetsDrawn,
        gamesWon: pmGamesWon,
        gamesLost: pmGamesLost,
        gamesDiff: pmGamesWon - pmGamesLost,
      })
    }

    const winRate =
      matchesCount > 0
        ? Math.round((wins / matchesCount) * 1000) / 10
        : 0

    const summary = {
      matches: matchesCount,
      wins,
      losses,
      draws,
      winRate,
      availabilityCount,
      teamMatches,
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

    const trendMetric = query.trendMetric
    let series: Array<{ month: string; value: number }> | null = null
    const requestedMetric: string | null = trendMetric ?? null
    let appliedMetric: string | null = null

    const byMonthMap = new Map<
      string,
      {
        matches: number
        wins: number
        losses: number
        draws: number
        setsPlayed: number
        setsWon: number
        setsLost: number
        gamesWon: number
        gamesLost: number
        subMatchesWon: number
        subMatchesLost: number
      }
    >()

    for (const bm of byMatch) {
      const d = new Date(bm.date as string)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      if (!byMonthMap.has(key)) {
        byMonthMap.set(key, {
          matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          setsPlayed: 0,
          setsWon: 0,
          setsLost: 0,
          gamesWon: 0,
          gamesLost: 0,
          subMatchesWon: 0,
          subMatchesLost: 0,
        })
      }
      const acc = byMonthMap.get(key)!
      acc.matches += bm.matches
      acc.wins += bm.wins
      acc.losses += bm.losses
      acc.draws += bm.draws
      acc.setsPlayed += bm.setsPlayed
      acc.setsWon += bm.setsWon
      acc.setsLost += bm.setsLost
      acc.gamesWon += bm.gamesWon
      acc.gamesLost += bm.gamesLost
      acc.subMatchesWon += bm.subMatchesWon
      acc.subMatchesLost += bm.subMatchesLost
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

    if (trendMetric) {
      const metricDef = findTrendMetric('PADEL', 'PLAYER', trendMetric)
      if (metricDef) {
        const trendInput: TrendMatchInput[] = byMatch.map((bm) => {
          const r = bm.result as MatchResult | null
          const values: Record<string, number> = {
            matchesPlayed: 1,
            wins: r === 'WIN' ? 1 : 0,
            losses: r === 'LOSS' ? 1 : 0,
            setsPlayed: bm.setsPlayed,
            setsWon: bm.setsWon,
            setsLost: bm.setsLost,
            gamesWon: bm.gamesWon,
            gamesLost: bm.gamesLost,
            gamesDiff: bm.gamesDiff,
            subMatchesWon: bm.subMatchesWon,
            subMatchesLost: bm.subMatchesLost,
            __ratioNum_winRate: r === 'WIN' ? 1 : 0,
            __ratioDen_winRate: 1,
          }
          return { date: new Date(bm.date as string), values }
        })
        series = buildMonthlySeries(trendInput, metricDef)
        appliedMetric = metricDef.trendKey ?? null
      }
    }

    const response = {
      team: { id: mainTeam.id, name: mainTeam.name, sport: mainTeam.sport },
      player: {
        userId: player.id,
        name: player.name,
        lastName: player.lastName,
      },
      filters: {
        seasonId: query.seasonId ?? null,
        from: byMatch.length > 0 ? byMatch[0].date : query.from ?? null,
        to:
          byMatch.length > 0
            ? byMatch[byMatch.length - 1].date
            : query.to ?? null,
        matchIds: query.matchIds ?? null,
        teamIds: teams.map((t) => t.id),
      },
      summary,
      byMatch,
      trend: {
        byMonth,
        series,
        requestedMetric,
        appliedMetric,
      },
    }

    const isRequestedAvailable =
      requestedMetric === null ||
      availableTrendMetrics.some((m) => m.key === requestedMetric)
    if (!isRequestedAvailable) {
      response.trend.series = null
      response.trend.appliedMetric = null
    }

    const visibleMetrics = filterStatsPayload(
      mainTeam.sport,
      visiblePlayerKeys,
      response as any,
      'byMatch',
    )

    return {
      ...response,
      visibleMetrics: Array.from(visibleMetrics),
      availableTrendMetrics,
    }
  }

  // ─────────────────────────────────────────────
  // BASKET — respuesta individual de jugador
  // ─────────────────────────────────────────────

  private buildBasketballPlayerResponse(
    teams: Array<{ id: string; name: string; sport: string }>,
    player: { id: string; name: string; lastName: string },
    query: PlayerStatsQueryDto,
    matches: Awaited<
      ReturnType<TeamStatsService['fetchBasketballMatchesForPlayer']>
    >,
    playerUserId: string,
    visiblePlayerKeys: Set<string>,
    availableTrendMetrics: Array<{ key: string; label: string; unit: string }>,
  ) {
    const mainTeam = teams[0]

    const perMatch = matches.map((m) =>
      computeBasketballStatsFromMatch({
        id: m.id,
        teamId: m.teamId,
        date: m.date,
        opponent: m.opponent,
        teamScore: m.teamScore,
        opponentScore: m.opponentScore,
        playerStats: m.playerStats.map((ps) => ({
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
      }),
    )

    let matchesCount = 0
    let wins = 0
    let losses = 0
    let draws = 0
    let availabilityCount = 0
    let teamMatches = 0

    let minutes = 0
    let points = 0
    let rebounds = 0
    let assists = 0
    let steals = 0
    let blocks = 0
    let turnovers = 0
    let fouls = 0
    let blocksAgainst = 0
    let foulsDrawn = 0
    let plusMinus = 0
    let fgm = 0
    let fga = 0
    let tpm = 0
    let tpa = 0
    let ftm = 0
    let fta = 0

    const byMatch: Array<Record<string, any>> = []

    for (let i = 0; i < perMatch.length; i++) {
      const pm = perMatch[i]
      const rawMatch = matches[i]
      teamMatches++

      const availability = rawMatch.callups?.find(
        (c) => c.userId === playerUserId,
      )?.availableStatus
      if (availability === 'YES') availabilityCount++

      const playerRow = pm.players.find((p) => p.userId === playerUserId)
      if (!playerRow) continue

      const matchResult = pm.match.result

      const valuation = computeValuation(playerRow)

      matchesCount++
      if (matchResult === 'WIN') wins++
      else if (matchResult === 'LOSS') losses++
      else if (matchResult === 'DRAW') draws++

      minutes += playerRow.minutes ?? 0
      points += playerRow.points
      rebounds += playerRow.rebounds
      assists += playerRow.assists
      steals += playerRow.steals
      blocks += playerRow.blocks
      turnovers += playerRow.turnovers
      fouls += playerRow.fouls
      blocksAgainst += playerRow.blocksAgainst
      foulsDrawn += playerRow.foulsDrawn
      plusMinus += playerRow.plusMinus ?? 0
      fgm += playerRow.fieldGoalsMade
      fga += playerRow.fieldGoalsAttempted
      tpm += playerRow.threePointersMade
      tpa += playerRow.threePointersAttempted
      ftm += playerRow.freeThrowsMade
      fta += playerRow.freeThrowsAttempted

      byMatch.push({
        matchId: pm.match.id,
        date: pm.match.date.toISOString(),
        opponent: pm.match.opponent,
        result: matchResult,
        teamScore: pm.match.teamScore,
        opponentScore: pm.match.opponentScore,
        matches: 1,
        wins: matchResult === 'WIN' ? 1 : 0,
        losses: matchResult === 'LOSS' ? 1 : 0,
        draws: matchResult === 'DRAW' ? 1 : 0,
        availabilityCount: availability === 'YES' ? 1 : 0,
        minutes: playerRow.minutes,
        points: playerRow.points,
        rebounds: playerRow.rebounds,
        assists: playerRow.assists,
        steals: playerRow.steals,
        blocks: playerRow.blocks,
        turnovers: playerRow.turnovers,
        fouls: playerRow.fouls,
        blocksAgainst: playerRow.blocksAgainst,
        foulsDrawn: playerRow.foulsDrawn,
        plusMinus: playerRow.plusMinus,
        valuation,
        fieldGoalsMade: playerRow.fieldGoalsMade,
        fieldGoalsAttempted: playerRow.fieldGoalsAttempted,
        fieldGoalPct: pct(
          playerRow.fieldGoalsMade,
          playerRow.fieldGoalsAttempted,
        ),
        threePointersMade: playerRow.threePointersMade,
        threePointersAttempted: playerRow.threePointersAttempted,
        threePointPct: pct(
          playerRow.threePointersMade,
          playerRow.threePointersAttempted,
        ),
        freeThrowsMade: playerRow.freeThrowsMade,
        freeThrowsAttempted: playerRow.freeThrowsAttempted,
        freeThrowPct: pct(
          playerRow.freeThrowsMade,
          playerRow.freeThrowsAttempted,
        ),
      })
    }

    const teamValuation = computeValuation({
      points,
      rebounds,
      assists,
      steals,
      blocks,
      foulsDrawn,
      fieldGoalsMade: fgm,
      fieldGoalsAttempted: fga,
      threePointersMade: tpm,
      threePointersAttempted: tpa,
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
      turnovers,
      blocksAgainst,
      fouls,
    })

    const winRate =
      matchesCount > 0
        ? Math.round((wins / matchesCount) * 1000) / 10
        : 0

    const summary = {
      matches: matchesCount,
      wins,
      losses,
      draws,
      winRate,
      availabilityCount,
      teamMatches,
      minutes,
      minutesPerMatch: perMatchAvg(minutes, matchesCount),
      points,
      pointsPerMatch: perMatchAvg(points, matchesCount),
      rebounds,
      assists,
      steals,
      blocks,
      turnovers,
      fouls,
      blocksAgainst,
      foulsDrawn,
      plusMinus,
      valuation: teamValuation,
      valuationPerMatch: perMatchAvg(teamValuation, matchesCount),
      fieldGoalsMade: fgm,
      fieldGoalsAttempted: fga,
      fieldGoalPct: pct(fgm, fga),
      threePointersMade: tpm,
      threePointersAttempted: tpa,
      threePointPct: pct(tpm, tpa),
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
      freeThrowPct: pct(ftm, fta),
    }

    const trendMetric = query.trendMetric
    let series: Array<{ month: string; value: number }> | null = null
    const requestedMetric: string | null = trendMetric ?? null
    let appliedMetric: string | null = null

    const byMonthMap = new Map<
      string,
      {
        matches: number
        wins: number
        losses: number
        draws: number
        points: number
        rebounds: number
        assists: number
        valuation: number
        fgm: number
        fga: number
        tpm: number
        tpa: number
        ftm: number
        fta: number
      }
    >()

    for (const bm of byMatch) {
      const d = new Date(bm.date as string)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      if (!byMonthMap.has(key)) {
        byMonthMap.set(key, {
          matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          points: 0,
          rebounds: 0,
          assists: 0,
          valuation: 0,
          fgm: 0,
          fga: 0,
          tpm: 0,
          tpa: 0,
          ftm: 0,
          fta: 0,
        })
      }
      const acc = byMonthMap.get(key)!
      acc.matches += bm.matches
      acc.wins += bm.wins
      acc.losses += bm.losses
      acc.draws += bm.draws
      acc.points += bm.points
      acc.rebounds += bm.rebounds
      acc.assists += bm.assists
      acc.valuation += bm.valuation
      acc.fgm += bm.fieldGoalsMade
      acc.fga += bm.fieldGoalsAttempted
      acc.tpm += bm.threePointersMade
      acc.tpa += bm.threePointersAttempted
      acc.ftm += bm.freeThrowsMade
      acc.fta += bm.freeThrowsAttempted
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

    if (trendMetric) {
      const metricDef = findTrendMetric('BASKETBALL', 'PLAYER', trendMetric)
      if (metricDef) {
        const trendInput: TrendMatchInput[] = byMatch.map((bm) => {
          const r = bm.result as MatchResult | null
          const pts = bm.points
          const reb = bm.rebounds
          const ast = bm.assists
          const val = bm.valuation

          const values: Record<string, number> = {
            matchesPlayed: 1,
            wins: r === 'WIN' ? 1 : 0,
            losses: r === 'LOSS' ? 1 : 0,
            points: pts,
            pointsPerMatch: pts,
            playerPoints: pts,
            playerPointsPerMatch: pts,
            rebounds: reb,
            reboundsPerMatch: reb,
            assists: ast,
            assistsPerMatch: ast,
            valuation: val,
            valuationPerMatch: val,
            __ratioNum_winRate: r === 'WIN' ? 1 : 0,
            __ratioDen_winRate: 1,
            __ratioNum_fgPct: bm.fieldGoalsMade,
            __ratioDen_fgPct: bm.fieldGoalsAttempted,
            __ratioNum_tpPct: bm.threePointersMade,
            __ratioDen_tpPct: bm.threePointersAttempted,
            __ratioNum_ftPct: bm.freeThrowsMade,
            __ratioDen_ftPct: bm.freeThrowsAttempted,
          }
          return { date: new Date(bm.date as string), values }
        })
        series = buildMonthlySeries(trendInput, metricDef)
        appliedMetric = metricDef.trendKey ?? null
      }
    }

    const response = {
      team: { id: mainTeam.id, name: mainTeam.name, sport: mainTeam.sport },
      player: {
        userId: player.id,
        name: player.name,
        lastName: player.lastName,
      },
      filters: {
        seasonId: query.seasonId ?? null,
        from: byMatch.length > 0 ? byMatch[0].date : query.from ?? null,
        to:
          byMatch.length > 0
            ? byMatch[byMatch.length - 1].date
            : query.to ?? null,
        matchIds: query.matchIds ?? null,
        teamIds: teams.map((t) => t.id),
      },
      summary,
      byMatch,
      trend: {
        byMonth,
        series,
        requestedMetric,
        appliedMetric,
      },
    }

    const isRequestedAvailable =
      requestedMetric === null ||
      availableTrendMetrics.some((m) => m.key === requestedMetric)
    if (!isRequestedAvailable) {
      response.trend.series = null
      response.trend.appliedMetric = null
    }

    const visibleMetrics = filterStatsPayload(
      mainTeam.sport,
      visiblePlayerKeys,
      response as any,
      'byMatch',
    )

    return {
      ...response,
      visibleMetrics: Array.from(visibleMetrics),
      availableTrendMetrics,
    }
  }

  // ─────────────────────────────────────────────
  // Helpers comunes
  // ─────────────────────────────────────────────

  private async resolveDateRange(
    teamId: string,
    query: TeamStatsQueryDto | PlayerStatsQueryDto,
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
  // PÁDEL — agregado de equipo
  // ─────────────────────────────────────────────

  private buildPadelResponse(
    teams: Array<{ id: string; name: string; sport: string }>,
    query: TeamStatsQueryDto,
    matches: Awaited<ReturnType<TeamStatsService['fetchPadelMatches']>>,
    visibleTeamKeys: Set<string>,
    availableTrendMetrics: Array<{ key: string; label: string; unit: string }>,
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

    for (let i = 0; i < perMatch.length; i++) {
      const pm = perMatch[i]
      const match = matches[i]
      const ts = pm.teamSummary
      const isAway = match.location === 'AWAY'

      matchesCount++
      if (ts.result === 'WIN') wins++
      else if (ts.result === 'LOSS') losses++
      else if (ts.result === 'DRAW') draws++

      subMatchesPlayed += ts.subMatchesPlayed
      subMatchesWon += ts.subMatchesWon
      subMatchesLost += ts.subMatchesLost
      subMatchesDrawn += ts.subMatchesDrawn

      const setsOurs = isAway ? ts.setsLost : ts.setsWon
      const setsTheirs = isAway ? ts.setsWon : ts.setsLost
      const gamesOurs = isAway ? ts.gamesLost : ts.gamesWon
      const gamesTheirs = isAway ? ts.gamesWon : ts.gamesLost

      setsPlayed += ts.setsPlayed
      setsWon += setsOurs
      setsLost += setsTheirs
      setsDrawn += ts.setsDrawn

      gamesWon += gamesOurs
      gamesLost += gamesTheirs
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
      const isAway = match.location === 'AWAY'

      const availabilityByUser = new Map<string, string>()
      for (const c of match.callups ?? []) {
        availabilityByUser.set(c.userId, c.availableStatus)
      }

      const participants = new Set<string>()
      for (const sm of pm.subMatches) {
        if (sm.player1) participants.add(sm.player1.id)
        if (sm.player2) participants.add(sm.player2.id)
      }

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

        const pSetsOurs = isAway ? p.setsLost : p.setsWon
        const pSetsTheirs = isAway ? p.setsWon : p.setsLost
        const pGamesOurs = isAway ? p.gamesLost : p.gamesWon
        const pGamesTheirs = isAway ? p.gamesWon : p.gamesLost

        agg.setsPlayed += p.setsPlayed
        agg.setsWon += pSetsOurs
        agg.setsLost += pSetsTheirs
        agg.setsDrawn += p.setsDrawn

        agg.gamesWon += pGamesOurs
        agg.gamesLost += pGamesTheirs
      }

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

    const trendMetric = query.trendMetric
    let series: Array<{ month: string; value: number }> | null = null
    const requestedMetric: string | null = trendMetric ?? null
    let appliedMetric: string | null = null

    if (trendMetric) {
      const metricDef = findTrendMetric('PADEL', 'TEAM', trendMetric)
      if (metricDef) {
        const trendInput: TrendMatchInput[] = perMatch.map((pm, i) => {
          const r = pm.match.result
          const ts = pm.teamSummary
          const isAway = matches[i].location === 'AWAY'

          const setsOurs = isAway ? ts.setsLost : ts.setsWon
          const setsTheirs = isAway ? ts.setsWon : ts.setsLost
          const gamesOurs = isAway ? ts.gamesLost : ts.gamesWon
          const gamesTheirs = isAway ? ts.gamesWon : ts.gamesLost

          const values: Record<string, number> = {
            matchesPlayed: 1,
            wins: r === 'WIN' ? 1 : 0,
            losses: r === 'LOSS' ? 1 : 0,
            setsPlayed: ts.setsPlayed,
            setsWon: setsOurs,
            setsLost: setsTheirs,
            gamesWon: gamesOurs,
            gamesLost: gamesTheirs,
            gamesDiff: gamesOurs - gamesTheirs,
            subMatchesWon: ts.subMatchesWon,
            subMatchesLost: ts.subMatchesLost,
            __ratioNum_winRate: r === 'WIN' ? 1 : 0,
            __ratioDen_winRate: 1,
          }
          return { date: pm.match.date, values }
        })

        series = buildMonthlySeries(trendInput, metricDef)
        appliedMetric = metricDef.trendKey ?? null
      }
    }

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
            series,
            requestedMetric,
            appliedMetric,
          },
        },
      },
    }

    const isRequestedAvailable =
      requestedMetric === null ||
      availableTrendMetrics.some((m) => m.key === requestedMetric)
    if (!isRequestedAvailable) {
      response.sport.data.trend.series = null
      response.sport.data.trend.appliedMetric = null
    }

    const visibleMetrics = filterStatsPayload(
      mainTeam.sport,
      visibleTeamKeys,
      response.sport.data as any,
    )

    return {
      ...response,
      visibleMetrics: Array.from(visibleMetrics),
      availableTrendMetrics,
    }
  }

  // ─────────────────────────────────────────────
  // FASE 3.4 — Equipos del jugador para el filtro multi-equipo
  // ─────────────────────────────────────────────

  async getPlayerTeamsForTeamContext(
    viewerId: string,
    teamId: string,
    playerUserId: string,
  ) {
    const teams = await getTeamsForViewer(this.prisma, viewerId, [teamId])
    const mainTeam = teams[0]

    const player = await this.prisma.user.findUnique({
      where: { id: playerUserId },
      select: { id: true, deletedAt: true },
    })
    if (!player || player.deletedAt) {
      throw new NotFoundException('Jugador no encontrado')
    }

    const candidateTeams = await this.prisma.team.findMany({
      where: {
        clubId: mainTeam.clubId,
        sport: mainTeam.sport,
        memberships: {
          some: { userId: playerUserId },
        },
      },
      include: {
        club: { select: { id: true, name: true } },
        memberships: {
          where: { userId: playerUserId },
          include: { roles: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const result = []
    for (const t of candidateTeams) {
      if (!(await canViewTeam(this.prisma, viewerId, t.id))) continue

      const membership = t.memberships[0] ?? null
      const roles = membership?.roles.map((r) => r.role) ?? []
      const isFormer = !membership || membership.status !== 'ACTIVE'

      result.push({
        id: t.id,
        name: t.name,
        sport: t.sport,
        category: t.category ?? null,
        club: {
          id: t.club.id,
          name: t.club.name,
        },
        role: roles[0] ?? null,
        roles,
        status: membership?.status ?? null,
        jerseyNumber: membership?.jerseyNumber ?? null,
        position: membership?.position ?? null,
        isFormer,
      })
    }

    return result
  }
}