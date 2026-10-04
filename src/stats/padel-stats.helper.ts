// ============================================
// PÁDEL — CÁLCULO PURO DE ESTADÍSTICAS
// ============================================
// Función pura (sin DB, sin permisos). Recibe un Match con
// padelSubMatches[].player1/player2/sets ya cargados y devuelve
// el mismo shape que expone GET /matches/:id/padel-stats.
//
// MODELO:
//   PadelSet.homeScore = score del LOCAL      (izquierda)
//   PadelSet.awayScore = score del VISITANTE  (derecha)
//
// Los AGREGADOS (sets, games) también van en formato LOCAL-VISITANTE:
//   - subMatches[].setsWon  = sets del LOCAL
//   - subMatches[].setsLost = sets del VISITANTE
//   - subMatches[].gamesWon = games del LOCAL
//   - subMatches[].gamesLost = games del VISITANTE
//   Igual para teamSummary y players.
//
// EXCEPCIONES (desde NUESTRA perspectiva):
//   - set.result  = WIN/LOSS/DRAW (según match.location)
//   - subMatch.result, teamSummary.result, players[].matchResult
//   - subMatchesWon/Lost/Drawn (contador de pistas ganadas/perdidas)
//
// La usa:
//   - MatchService.getPadelStats(userId, matchId)  → con 1 match
//   - TeamStatsService.getTeamStats(...)            → con N matches

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

type MatchLocation = 'HOME' | 'AWAY' | 'NEUTRAL'

export type MatchWithPadel = {
  id: string
  teamId: string
  date: Date
  opponent: string
  location: MatchLocation
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
    location: MatchLocation
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

/**
 * Devuelve [nuestro score, score del rival] a partir de un set con
 * homeScore = local, awayScore = visitante, según match.location.
 */
function translateScores(
  s: { homeScore: number; awayScore: number },
  location: MatchLocation,
): { ours: number; theirs: number } {
  if (location === 'AWAY') {
    // Local = rival, visitante = nuestro
    return { ours: s.awayScore, theirs: s.homeScore }
  }
  // HOME / NEUTRAL → local = nuestro, visitante = rival
  return { ours: s.homeScore, theirs: s.awayScore }
}

const setResult = (
  s: { homeScore: number; awayScore: number },
  location: MatchLocation,
): SetResult => {
  if (!setHasData(s)) return null
  const { ours, theirs } = translateScores(s, location)
  if (ours > theirs) return 'WIN'
  if (ours < theirs) return 'LOSS'
  return 'DRAW'
}

// ─────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────

export function computePadelStatsFromMatch(
  match: MatchWithPadel,
): PadelStatsResult {
  const location = match.location
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

      // Agregados en formato local-visitante
      let setsWonLocal = 0
      let setsWonVisitante = 0
      let setsDrawn = 0
      let gamesLocal = 0
      let gamesVisitante = 0

      // Contador de pistas ganadas/perdidas (nuestra perspectiva)
      let setsOursWon = 0
      let setsOursLost = 0

      for (const s of validSets) {
        gamesLocal += s.homeScore
        gamesVisitante += s.awayScore

        // Contamos sets desde la perspectiva local-visitante
        if (s.homeScore > s.awayScore) setsWonLocal++
        else if (s.homeScore < s.awayScore) setsWonVisitante++
        else setsDrawn++

        // Y desde nuestra perspectiva (para result)
        const r = setResult(s, location)
        if (r === 'WIN') setsOursWon++
        else if (r === 'LOSS') setsOursLost++
      }

      let result: SubMatchResult = null
      if (validSets.length > 0) {
        if (setsOursWon > setsOursLost) result = 'WIN'
        else if (setsOursWon < setsOursLost) result = 'LOSS'
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
        setsWon: setsWonLocal,
        setsLost: setsWonVisitante,
        setsDrawn,
        gamesWon: gamesLocal,
        gamesLost: gamesVisitante,
        gamesDiff: gamesLocal - gamesVisitante,
        sets: sm.sets.map((s) => ({
          id: s.id,
          order: s.order,
          homeScore: s.homeScore,
          awayScore: s.awayScore,
          result: setResult(s, location),
        })),
      }
    },
  )

  // ── Resumen del equipo (agregados en formato local-visitante)
  let subMatchesWon = 0
  let subMatchesLost = 0
  let subMatchesDrawn = 0

  let setsWon = 0
  let setsLost = 0
  let setsDrawn = 0
  let gamesWon = 0
  let gamesLost = 0

  for (const sm of subMatchesPayload) {
    // Contador de pistas: desde nuestra perspectiva
    if (sm.result === 'WIN') subMatchesWon++
    else if (sm.result === 'LOSS') subMatchesLost++
    else if (sm.result === 'DRAW') subMatchesDrawn++

    // Sets y games: local-visitante
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

  // ── Por jugador (agregados en formato local-visitante)
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
    setsOursWon: number // auxiliar para winRate
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
        setsOursWon: 0,
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

      // Contador de pistas: desde nuestra perspectiva
      if (sm.result !== null) {
        agg.subMatchesPlayed++
        if (sm.result === 'WIN') agg.subMatchesWon++
        else if (sm.result === 'LOSS') agg.subMatchesLost++
        else agg.subMatchesDrawn++
      }

      // Sets y games: local-visitante
      agg.setsPlayed += sm.setsWon + sm.setsLost + sm.setsDrawn
      agg.setsWon += sm.setsWon
      agg.setsLost += sm.setsLost
      agg.setsDrawn += sm.setsDrawn
      agg.gamesWon += sm.gamesWon
      agg.gamesLost += sm.gamesLost

      // Auxiliar para setsWinRate desde nuestra perspectiva
      // (setsOursWon = sets ganados por nosotros en esta pista)
      // Necesitamos recalcularlo aquí: los sets ganados por nosotros
      // en esta pista son los que tienen result WIN.
      for (const s of sm.sets) {
        const r = setResult(s, location)
        if (r === 'WIN') agg.setsOursWon++
      }
    }
  }

  const playersPayload: PadelPlayerPayload[] = Array.from(playersMap.values())
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      lastName: p.lastName,
      subMatchesPlayed: p.subMatchesPlayed,
      subMatchesWon: p.subMatchesWon,
      subMatchesLost: p.subMatchesLost,
      subMatchesDrawn: p.subMatchesDrawn,
      setsPlayed: p.setsPlayed,
      setsWon: p.setsWon,
      setsLost: p.setsLost,
      setsDrawn: p.setsDrawn,
      gamesWon: p.gamesWon,
      gamesLost: p.gamesLost,
      setsWinRate:
        p.setsPlayed > 0
          ? Math.round((p.setsOursWon / p.setsPlayed) * 100)
          : 0,
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
      location,
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