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
      assists,
      steals,
      blocks,
      turnovers,
      fouls,
      blocksAgainst,
      foulsDrawn,
      plusMinus,
      valuation: teamValuation,
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

    // ── Por jugador (agregación multi-equipo, una fila por userId)
    type PlayerAgg = {
      userId: string
      name: string
      lastName: string
      matches: number
      wins: number
      losses: number
      draws: number
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

    for (const pm of perMatchStats) {
      const matchResult = resultFromMatch(pm.match)

      for (const p of pm.players) {
        if (!playersMap.has(p.userId)) {
          playersMap.set(p.userId, {
            userId: p.userId,
            name: p.name,
            lastName: p.lastName,
            matches: 0,
            wins: 0,
            losses: 0,
            draws: 0,
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
        const agg = playersMap.get(p.userId)!

        agg.matches++
        if (matchResult === 'WIN') agg.wins++
        else if (matchResult === 'LOSS') agg.losses++
        else if (matchResult === 'DRAW') agg.draws++

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

    // ── Trend
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
        seasonId: query.seasonId ?? null,
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
          },
        },
      },
    }
  }
}