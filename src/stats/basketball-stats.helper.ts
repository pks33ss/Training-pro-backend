// ============================================
// BALONCESTO — CÁLCULO PURO DE ESTADÍSTICAS
// ============================================

type UserMini = {
  id: string
  name: string
  lastName: string
}

export type BasketballPlayerStatsRow = {
  userId: string
  user: UserMini
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
}

export type MatchWithBasketball = {
  id: string
  teamId: string
  date: Date
  opponent: string
  teamScore: number | null
  opponentScore: number | null
  playerStats: BasketballPlayerStatsRow[]
}

export type MatchResult = 'WIN' | 'LOSS' | 'DRAW' | null

// ─────────────────────────────────────────────
// Helpers numéricos
// ─────────────────────────────────────────────

export function pct(made: number, attempted: number): number {
  if (attempted <= 0) return 0
  return Math.round((made / attempted) * 1000) / 10
}

export function perMatch(total: number, matches: number): number {
  if (matches <= 0) return 0
  return Math.round((total / matches) * 10) / 10
}

// ─────────────────────────────────────────────
// Valoración (Euroliga / PIR)
// =============================================
// valuation = PTS + REB + AST + STL + BLK + FR
//           - (FGA - FGM)
//           - (3PA - 3PM)
//           - (FTA - FTM)
//           - TO
//           - TpC (blocksAgainst)
//           - Faltas cometidas
// ─────────────────────────────────────────────

export function computeValuation(s: {
  points: number
  rebounds: number
  assists: number
  steals: number
  blocks: number
  foulsDrawn: number
  fieldGoalsMade: number
  fieldGoalsAttempted: number
  threePointersMade: number
  threePointersAttempted: number
  freeThrowsMade: number
  freeThrowsAttempted: number
  turnovers: number
  blocksAgainst: number
  fouls: number
}): number {
  return (
    s.points +
    s.rebounds +
    s.assists +
    s.steals +
    s.blocks +
    s.foulsDrawn -
    (s.fieldGoalsAttempted - s.fieldGoalsMade) -
    (s.threePointersAttempted - s.threePointersMade) -
    (s.freeThrowsAttempted - s.freeThrowsMade) -
    s.turnovers -
    s.blocksAgainst -
    s.fouls
  )
}

// ─────────────────────────────────────────────
// Resultado de un partido
// ─────────────────────────────────────────────

export function resultFromMatch(m: {
  teamScore: number | null
  opponentScore: number | null
}): MatchResult {
  if (m.teamScore === null || m.opponentScore === null) return null
  if (m.teamScore > m.opponentScore) return 'WIN'
  if (m.teamScore < m.opponentScore) return 'LOSS'
  return 'DRAW'
}

// ─────────────────────────────────────────────
// Stats de un partido (para la vista por partido)
// ─────────────────────────────────────────────

export type BasketballMatchStatsResult = {
  match: {
    id: string
    teamId: string
    date: Date
    opponent: string
    teamScore: number | null
    opponentScore: number | null
    result: MatchResult
    hasGlobalScore: boolean
  }
  teamSummary: {
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
    valuation: number
    fieldGoalsMade: number
    fieldGoalsAttempted: number
    threePointersMade: number
    threePointersAttempted: number
    freeThrowsMade: number
    freeThrowsAttempted: number
    fieldGoalPct: number
    threePointPct: number
    freeThrowPct: number
  }
  players: Array<{
    userId: string
    name: string
    lastName: string
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
    valuation: number
    fieldGoalsMade: number
    fieldGoalsAttempted: number
    fieldGoalPct: number
    threePointersMade: number
    threePointersAttempted: number
    threePointPct: number
    freeThrowsMade: number
    freeThrowsAttempted: number
    freeThrowPct: number
  }>
}

export function computeBasketballStatsFromMatch(
  match: MatchWithBasketball,
): BasketballMatchStatsResult {
  const result = resultFromMatch(match)

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

  const players = match.playerStats.map((ps) => {
    points += ps.points
    rebounds += ps.rebounds
    assists += ps.assists
    steals += ps.steals
    blocks += ps.blocks
    turnovers += ps.turnovers
    fouls += ps.fouls
    blocksAgainst += ps.blocksAgainst
    foulsDrawn += ps.foulsDrawn
    plusMinus += ps.plusMinus ?? 0
    fgm += ps.fieldGoalsMade
    fga += ps.fieldGoalsAttempted
    tpm += ps.threePointersMade
    tpa += ps.threePointersAttempted
    ftm += ps.freeThrowsMade
    fta += ps.freeThrowsAttempted

    const valuation = computeValuation(ps)

    return {
      userId: ps.userId,
      name: ps.user.name,
      lastName: ps.user.lastName,
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
      valuation,
      fieldGoalsMade: ps.fieldGoalsMade,
      fieldGoalsAttempted: ps.fieldGoalsAttempted,
      fieldGoalPct: pct(ps.fieldGoalsMade, ps.fieldGoalsAttempted),
      threePointersMade: ps.threePointersMade,
      threePointersAttempted: ps.threePointersAttempted,
      threePointPct: pct(ps.threePointersMade, ps.threePointersAttempted),
      freeThrowsMade: ps.freeThrowsMade,
      freeThrowsAttempted: ps.freeThrowsAttempted,
      freeThrowPct: pct(ps.freeThrowsMade, ps.freeThrowsAttempted),
    }
  })

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

  return {
    match: {
      id: match.id,
      teamId: match.teamId,
      date: match.date,
      opponent: match.opponent,
      teamScore: match.teamScore,
      opponentScore: match.opponentScore,
      result,
      hasGlobalScore:
        match.teamScore !== null && match.opponentScore !== null,
    },
    teamSummary: {
      points,
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
      threePointersMade: tpm,
      threePointersAttempted: tpa,
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
      fieldGoalPct: pct(fgm, fga),
      threePointPct: pct(tpm, tpa),
      freeThrowPct: pct(ftm, fta),
    },
    players,
  }
}