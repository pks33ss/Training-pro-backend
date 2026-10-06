import { Injectable } from '@nestjs/common'
import {
  MatchWithBasketball,
  computeBasketballStatsFromMatch,
  computeValuation,
  pct,
  perMatch,
  resultFromMatch,
} from './basketball-stats.helper'
import type { TeamStatsQueryDto } from './dto/team-stats-query.dto'
import { findTrendMetric } from './metric-registry'
import { buildMonthlySeries, TrendMatchInput } from './trend.helper'

type MatchLoaded = {
  id: string
  teamId: string
  date: Date
  opponent: string
  teamScore: number | null
  opponentScore: number | null
  playerStats: Array<{
    userId: string
    minutes: number | null
    points: number
    rebounds: number
    assists: number
    steals: number
    blocks: number
    turnovers: number
    fouls: number
    blocksAgainst: number
    foulsDrawn: number
    plusMinus: number | null
    fieldGoalsMade: number
    fieldGoalsAttempted: number
    threePointersMade: number
    threePointersAttempted: number
    freeThrowsMade: number
    freeThrowsAttempted: number
    user: { id: string; name: string; lastName: string }
  }>
  callups?: Array<{
    userId: string
    availableStatus: string
    user: { id: string; name: string; lastName: string }
  }>
}

@Injectable()
export class BasketballStatsService {
  buildTeamStats(
    teams: Array<{ id: string; name: string; sport: string }>,
    query: TeamStatsQueryDto,
    matches: MatchLoaded[],
  ) {
    const pureMatches: MatchWithBasketball[] = matches.map((m) => ({
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
    }))

    const perMatchStats = pureMatches.map((m) =>
      computeBasketballStatsFromMatch(m),
    )

    // ── Summary global
    let matchesCount = 0
    let wins = 0
    let losses = 0
    let draws = 0

    let points = 0
    let opponentPoints = 0
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
    let totalMinutes = 0

    for (const pm of perMatchStats) {
      matchesCount++
      const r = resultFromMatch(pm.match)
      if (r === 'WIN') wins++
      else if (r === 'LOSS') losses++
      else if (r === 'DRAW') draws++

      points += pm.teamSummary.points
      opponentPoints += pm.match.opponentScore ?? 0
      rebounds += pm.teamSummary.rebounds
      assists += pm.teamSummary.assists
      steals += pm.teamSummary.steals
      blocks += pm.teamSummary.blocks
      turnovers += pm.teamSummary.turnovers
      fouls += pm.teamSummary.fouls
      blocksAgainst += pm.teamSummary.blocksAgainst
      foulsDrawn += pm.teamSummary.foulsDrawn
      plusMinus += pm.teamSummary.plusMinus
      fgm += pm.teamSummary.fieldGoalsMade
      fga += pm.teamSummary.fieldGoalsAttempted
      tpm += pm.teamSummary.threePointersMade
      tpa += pm.teamSummary.threePointersAttempted
      ftm += pm.teamSummary.freeThrowsMade
      fta += pm.teamSummary.freeThrowsAttempted

      for (const p of pm.players) {
        if (typeof p.minutes === 'number') totalMinutes += p.minutes
      }
    }

    const winRate =
      wins + losses + draws > 0
        ? Math.round((wins / (wins + losses + draws)) * 1000) / 10
        : 0

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

    const summary = {
      matches: matchesCount,
      wins,
      losses,
      draws,
      winRate,
      points,
      opponentPoints,
      pointsPerMatch: perMatch(points, matchesCount),
      opponentPointsPerMatch: perMatch(opponentPoints, matchesCount),
      totalMinutes,
      minutesPerMatch: perMatch(totalMinutes, matchesCount),
      rebounds,
      reboundsPerMatch: perMatch(rebounds, matchesCount),
      assists,
      assistsPerMatch: perMatch(assists, matchesCount),
      steals,
      stealsPerMatch: perMatch(steals, matchesCount),
      blocks,
      blocksPerMatch: perMatch(blocks, matchesCount),
      turnovers,
      turnoversPerMatch: perMatch(turnovers, matchesCount),
      fouls,
      blocksAgainst,
      foulsDrawn,
      plusMinus,
      valuation: teamValuation,
      valuationPerMatch: perMatch(teamValuation, matchesCount),
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

    // ── Por jugador
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
      minutes: number
      points: number
      rebounds: number
      assists: number
      steals: number
      blocks: number
      turnovers: number
      fouls: number
      blocksAgainst: number
      foulsDrawn: number
      plusMinus: number
      fieldGoalsMade: number
      fieldGoalsAttempted: number
      threePointersMade: number
      threePointersAttempted: number
      freeThrowsMade: number
      freeThrowsAttempted: number
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
          minutes: 0,
          points: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          fouls: 0,
          blocksAgainst: 0,
          foulsDrawn: 0,
          plusMinus: 0,
          fieldGoalsMade: 0,
          fieldGoalsAttempted: 0,
          threePointersMade: 0,
          threePointersAttempted: 0,
          freeThrowsMade: 0,
          freeThrowsAttempted: 0,
        })
      }
      return playersMap.get(u.id)!
    }

    for (let i = 0; i < perMatchStats.length; i++) {
      const pm = perMatchStats[i]
      const rawMatch = matches[i]
      const matchResult = resultFromMatch(pm.match)

      const availabilityByUser = new Map<string, string>()
      for (const c of rawMatch.callups ?? []) {
        availabilityByUser.set(c.userId, c.availableStatus)
      }

      // ── Pase 1: jugadores con stats (jugaron)
      for (const p of pm.players) {
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

        if (typeof p.minutes === 'number') agg.minutes += p.minutes
        agg.points += p.points
        agg.rebounds += p.rebounds
        agg.assists += p.assists
        agg.steals += p.steals
        agg.blocks += p.blocks
        agg.turnovers += p.turnovers
        agg.fouls += p.fouls
        agg.blocksAgainst += p.blocksAgainst
        agg.foulsDrawn += p.foulsDrawn
        agg.plusMinus += p.plusMinus ?? 0
        agg.fieldGoalsMade += p.fieldGoalsMade
        agg.fieldGoalsAttempted += p.fieldGoalsAttempted
        agg.threePointersMade += p.threePointersMade
        agg.threePointersAttempted += p.threePointersAttempted
        agg.freeThrowsMade += p.freeThrowsMade
        agg.freeThrowsAttempted += p.freeThrowsAttempted
      }

      // ── Pase 2: jugadores con callup (no tienen stats en este partido)
      const playersInStats = new Set(pm.players.map((p) => p.userId))
      for (const c of rawMatch.callups ?? []) {
        if (playersInStats.has(c.userId)) continue

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
      .map((p) => {
        const valuation = computeValuation({
          points: p.points,
          rebounds: p.rebounds,
          assists: p.assists,
          steals: p.steals,
          blocks: p.blocks,
          foulsDrawn: p.foulsDrawn,
          fieldGoalsMade: p.fieldGoalsMade,
          fieldGoalsAttempted: p.fieldGoalsAttempted,
          threePointersMade: p.threePointersMade,
          threePointersAttempted: p.threePointersAttempted,
          freeThrowsMade: p.freeThrowsMade,
          freeThrowsAttempted: p.freeThrowsAttempted,
          turnovers: p.turnovers,
          blocksAgainst: p.blocksAgainst,
          fouls: p.fouls,
        })

        return {
          ...p,
          minutesPerMatch: perMatch(p.minutes, p.matches),
          pointsPerMatch: perMatch(p.points, p.matches),
          fieldGoalPct: pct(p.fieldGoalsMade, p.fieldGoalsAttempted),
          threePointPct: pct(p.threePointersMade, p.threePointersAttempted),
          freeThrowPct: pct(p.freeThrowsMade, p.freeThrowsAttempted),
          valuation,
          valuationPerMatch: perMatch(valuation, p.matches),
          winRate:
            p.matches > 0
              ? Math.round((p.wins / p.matches) * 1000) / 10
              : 0,
        }
      })
      .sort((a, b) => {
        if (b.pointsPerMatch !== a.pointsPerMatch)
          return b.pointsPerMatch - a.pointsPerMatch
        return b.points - a.points
      })

    // ── Trend (byMonth histórico)
    const byMonthMap = new Map<
      string,
      {
        matches: number
        wins: number
        losses: number
        draws: number
        points: number
        opponentPoints: number
      }
    >()

    for (const pm of perMatchStats) {
      const d = pm.match.date
      const key = `${d.getUTCFullYear()}-${String(
        d.getUTCMonth() + 1,
      ).padStart(2, '0')}`
      if (!byMonthMap.has(key)) {
        byMonthMap.set(key, {
          matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          points: 0,
          opponentPoints: 0,
        })
      }
      const b = byMonthMap.get(key)!
      b.matches++
      const r = resultFromMatch(pm.match)
      if (r === 'WIN') b.wins++
      else if (r === 'LOSS') b.losses++
      else if (r === 'DRAW') b.draws++
      b.points += pm.teamSummary.points
      b.opponentPoints += pm.match.opponentScore ?? 0
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
        points: v.points,
        opponentPoints: v.opponentPoints,
        pointsPerMatch: perMatch(v.points, v.matches),
        opponentPointsPerMatch: perMatch(v.opponentPoints, v.matches),
      }))

    // ── Trend (series opcional por trendMetric)
    const trendMetric = query.trendMetric
    let series: Array<{ month: string; value: number }> | null = null
    const requestedMetric: string | null = trendMetric ?? null
    let appliedMetric: string | null = null

    if (trendMetric) {
      const metricDef = findTrendMetric('BASKETBALL', 'TEAM', trendMetric)
      if (metricDef) {
        const trendInput: TrendMatchInput[] = perMatchStats.map((pm) => {
          const r = resultFromMatch(pm.match)
          const pts = pm.teamSummary.points
          const oppPts = pm.match.opponentScore ?? 0
          const reb = pm.teamSummary.rebounds
          const ast = pm.teamSummary.assists
          const stl = pm.teamSummary.steals
          const blk = pm.teamSummary.blocks
          const tov = pm.teamSummary.turnovers
          const val = pm.teamSummary.valuation

          const values: Record<string, number> = {
            matchesPlayed: 1,
            wins: r === 'WIN' ? 1 : 0,
            losses: r === 'LOSS' ? 1 : 0,
            points: pts,
            pointsPerMatch: pts,
            opponentPoints: oppPts,
            opponentPointsPerMatch: oppPts,
            rebounds: reb,
            reboundsPerMatch: reb,
            assists: ast,
            assistsPerMatch: ast,
            steals: stl,
            stealsPerMatch: stl,
            blocks: blk,
            blocksPerMatch: blk,
            turnovers: tov,
            turnoversPerMatch: tov,
            valuation: val,
            valuationPerMatch: val,

            __ratioNum_winRate: r === 'WIN' ? 1 : 0,
            __ratioDen_winRate: 1,
            __ratioNum_fgPct: pm.teamSummary.fieldGoalsMade,
            __ratioDen_fgPct: pm.teamSummary.fieldGoalsAttempted,
            __ratioNum_tpPct: pm.teamSummary.threePointersMade,
            __ratioDen_tpPct: pm.teamSummary.threePointersAttempted,
            __ratioNum_ftPct: pm.teamSummary.freeThrowsMade,
            __ratioDen_ftPct: pm.teamSummary.freeThrowsAttempted,
          }
          return { date: pm.match.date, values }
        })

        series = buildMonthlySeries(trendInput, metricDef)
        appliedMetric = metricDef.trendKey ?? null
      }
    }

    const last10ByMatch = perMatchStats.slice(-10).map((pm) => ({
      matchId: pm.match.id,
      date: pm.match.date.toISOString(),
      opponent: pm.match.opponent,
      result: resultFromMatch(pm.match),
      teamScore: pm.match.teamScore,
      opponentScore: pm.match.opponentScore,
    }))

    return {
      teams: teams.map((t) => ({ id: t.id, name: t.name, sport: t.sport })),
      filters: {
        season: query.season ?? null,
        from:
          perMatchStats.length > 0
            ? perMatchStats[0].match.date.toISOString()
            : query.from ?? null,
        to:
          perMatchStats.length > 0
            ? perMatchStats[perMatchStats.length - 1].match.date.toISOString()
            : query.to ?? null,
        playerId: query.playerId ?? null,
        matchIds: query.matchIds ?? null,
        teamIds: teams.map((t) => t.id),
      },
      sport: {
        type: 'BASKETBALL',
        data: {
          summary,
          players,
          trend: {
            byMonth,
            last10ByMatch,
            series,
            requestedMetric,
            appliedMetric,
          },
        },
      },
    }
  }
}