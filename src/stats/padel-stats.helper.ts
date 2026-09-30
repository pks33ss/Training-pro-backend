// ============================================
// PÁDEL — CÁLCULO PURO DE ESTADÍSTICAS
// ============================================
// Función pura (sin DB, sin permisos). Recibe un Match con
// padelSubMatches[].player1/player2/sets ya cargados y devuelve
// el mismo shape que expone GET /matches/:id/padel-stats.
//
// La usa:
//   - MatchService.getPadelStats(userId, matchId)  → con 1 match
//   - TeamStatsService.getTeamStats(...)            → con N matches

const USER_FIELDS = ['id', 'name', 'lastName'] as const

type UserMini = {
  id: string
  name: string
  lastName: string
}

type SetLike = {
  id: string
  order: number
  homeScore: number
  awayScore: number
  played: boolean
}

type SubMatchLike = {
  id: string
  order: number
  player1: UserMini | null
  player2: UserMini | null
  sets: SetLike[]
}

export type MatchWithPadel = {
  id: string
  teamId: string
  date: Date
  opponent: string
  teamScore: number | null
  opponentScore: number | null
  padelSubMatches: SubMatchLike[]
}

export type SetResult = 'WIN' | 'LOSS' | 'DRAW' | null
export type SubMatchResult = 'WIN' | 'LOSS' | 'DRAW' | null
export type MatchResult = 'WIN' | 'LOSS' | 'DRAW' | null

export type PadelSetPayload = {
  id: string
  order: number
  homeScore: number
  awayScore: number
  result: SetResult
}

export type PadelSubMatchPayload = {
  id: string
  order: number
  player1: { id: string; name: string; lastName: string } | null
  player2: { id: string; name: string; lastName: string } | null
  result: SubMatchResult
  setsWon: number
  setsLost: number
  setsDrawn: number
  gamesWon: number
  gamesLost: number
  gamesDiff: number
  sets: PadelSetPayload[]
}

export type PadelTeamSummary = {
  result: MatchResult
  teamScore: number | null
  opponentScore: number | null
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
  gamesDiff: number
}

export type PadelPlayerPayload = {
  userId: string
  name: string
  lastName: string
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
  setsWinRate: number
  gamesDiff: number
  matchResult: MatchResult
}

export type PadelStatsResult = {
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
  teamSummary: PadelTeamSummary
  subMatches: PadelSubMatchPayload[]
  players: PadelPlayerPayload[]
}

// ─────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────

const setHasData = (s: { homeScore: number; awayScore: number }) =>
  s.homeScore > 0 || s.awayScore > 0

const setResult = (s: { homeScore: number; awayScore: number }): SetResult => {
  if (!setHasData(s)) return null
  if (s.homeScore > s.awayScore) return 'WIN'
  if (s.homeScore < s.awayScore) return 'LOSS'
  return 'DRAW'
}

// ─────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────

export function computePadelStatsFromMatch(
  match: MatchWithPadel,
): PadelStatsResult {
  const hasGlobalScore =
    match.teamScore !== null && match.opponentScore !== null

  let matchResult: MatchResult = null
  if (hasGlobalScore) {
    if (match.teamScore! > match.opponentScore!) matchResult = 'WIN'
    else if (match.teamScore! < match.opponentScore!) matchResult = 'LOSS'
    else matchResult = 'DRAW'
  }

  // ── Por pista
  const subMatchesPayload: PadelSubMatchPayload[] = match.padelSubMatches.map(
    (sm) => {
      const validSets = sm.sets.filter(setHasData)

      let setsWon = 0
      let setsLost = 0
      let setsDrawn = 0
      let gamesWon = 0
      let gamesLost = 0

      for (const s of validSets) {
        gamesWon += s.homeScore
        gamesLost += s.awayScore
        const r = setResult(s)
        if (r === 'WIN') setsWon++
        else if (r === 'LOSS') setsLost++
        else if (r === 'DRAW') setsDrawn++
      }

      let result: SubMatchResult = null
      if (validSets.length > 0) {
        if (setsWon > setsLost) result = 'WIN'
        else if (setsWon < setsLost) result = 'LOSS'
        else result = 'DRAW'
      }

      return {
        id: sm.id,
        order: sm.order,
        player1: sm.player1
          ? { id: sm.player1.id, name: sm.player1.name, lastName: sm.player1.lastName }
          : null,
        player2: sm.player2
          ? { id: sm.player2.id, name: sm.player2.name, lastName: sm.player2.lastName }
          : null,
        result,
        setsWon,
        setsLost,
        setsDrawn,
        gamesWon,
        gamesLost,
        gamesDiff: gamesWon - gamesLost,
        sets: sm.sets.map((s) => ({
          id: s.id,
          order: s.order,
          homeScore: s.homeScore,
          awayScore: s.awayScore,
          result: setResult(s),
        })),
      }
    },
  )

  // ── Resumen del equipo
  let subMatchesWon = 0
  let subMatchesLost = 0
  let subMatchesDrawn = 0
  let setsWon = 0
  let setsLost = 0
  let setsDrawn = 0
  let gamesWon = 0
  let gamesLost = 0

  for (const sm of subMatchesPayload) {
    if (sm.result === 'WIN') subMatchesWon++
    else if (sm.result === 'LOSS') subMatchesLost++
    else if (sm.result === 'DRAW') subMatchesDrawn++

    setsWon += sm.setsWon
    setsLost += sm.setsLost
    setsDrawn += sm.setsDrawn
    gamesWon += sm.gamesWon
    gamesLost += sm.gamesLost
  }

  const teamSummary: PadelTeamSummary = {
    result: matchResult,
    teamScore: match.teamScore,
    opponentScore: match.opponentScore,
    subMatchesPlayed: subMatchesPayload.filter((s) => s.result !== null).length,
    subMatchesWon,
    subMatchesLost,
    subMatchesDrawn,
    setsPlayed: setsWon + setsLost + setsDrawn,
    setsWon,
    setsLost,
    setsDrawn,
    gamesWon,
    gamesLost,
    gamesDiff: gamesWon - gamesLost,
  }

  // ── Por jugador
  type PlayerAgg = {
    userId: string
    name: string
    lastName: string
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

  const ensurePlayer = (u: UserMini) => {
    if (!playersMap.has(u.id)) {
      playersMap.set(u.id, {
        userId: u.id,
        name: u.name,
        lastName: u.lastName,
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

  for (const sm of subMatchesPayload) {
    const validPlayers = [sm.player1, sm.player2].filter(
      (p): p is UserMini => p !== null,
    )
    for (const p of validPlayers) {
      const agg = ensurePlayer(p)
      if (sm.result !== null) {
        agg.subMatchesPlayed++
        if (sm.result === 'WIN') agg.subMatchesWon++
        else if (sm.result === 'LOSS') agg.subMatchesLost++
        else agg.subMatchesDrawn++
      }
      agg.setsPlayed += sm.setsWon + sm.setsLost + sm.setsDrawn
      agg.setsWon += sm.setsWon
      agg.setsLost += sm.setsLost
      agg.setsDrawn += sm.setsDrawn
      agg.gamesWon += sm.gamesWon
      agg.gamesLost += sm.gamesLost
    }
  }

  const playersPayload: PadelPlayerPayload[] = Array.from(playersMap.values())
    .map((p) => ({
      ...p,
      setsWinRate:
        p.setsPlayed > 0 ? Math.round((p.setsWon / p.setsPlayed) * 100) : 0,
      gamesDiff: p.gamesWon - p.gamesLost,
      matchResult,
    }))
    .sort((a, b) => {
      if (b.setsWinRate !== a.setsWinRate) return b.setsWinRate - a.setsWinRate
      return b.gamesDiff - a.gamesDiff
    })

  return {
    match: {
      id: match.id,
      teamId: match.teamId,
      date: match.date,
      opponent: match.opponent,
      teamScore: match.teamScore,
      opponentScore: match.opponentScore,
      result: matchResult,
      hasGlobalScore,
    },
    teamSummary,
    subMatches: subMatchesPayload,
    players: playersPayload,
  }
}