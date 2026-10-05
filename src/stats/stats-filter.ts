import { StatsAudienceRole, StatsScope } from '@prisma/client'
import { getValidMetricKeys, getTrendableMetrics } from './metric-registry'
import type { MetricDefinition } from './metric-registry'

interface MetricFieldMap {
  summary?: string[]
  players?: string[]
}

// ============================================
// BALONCESTO
// ============================================

const BASKETBALL_FIELDS: Record<string, MetricFieldMap> = {
  MATCHES: { summary: ['matches'] },
  WINS: { summary: ['wins'] },
  LOSSES: { summary: ['losses'] },
  DRAWS: { summary: ['draws'] },
  WIN_RATE: { summary: ['winRate'] },

  POINTS: { summary: ['points'], players: ['points'] },
  OPPONENT_POINTS: { summary: ['opponentPoints'] },
  POINTS_PER_MATCH: { summary: ['pointsPerMatch'], players: ['pointsPerMatch'] },
  OPPONENT_POINTS_PER_MATCH: { summary: ['opponentPointsPerMatch'] },
  TOTAL_MINUTES: { summary: ['totalMinutes'] },
  MINUTES_PER_MATCH: { summary: ['minutesPerMatch'] },

  REBOUNDS: { summary: ['rebounds'], players: ['rebounds'] },
  ASSISTS: { summary: ['assists'], players: ['assists'] },
  STEALS: { summary: ['steals'], players: ['steals'] },
  BLOCKS: { summary: ['blocks'], players: ['blocks'] },
  BLOCKS_AGAINST: { summary: ['blocksAgainst'], players: ['blocksAgainst'] },
  TURNOVERS: { summary: ['turnovers'], players: ['turnovers'] },
  FOULS: { summary: ['fouls'], players: ['fouls'] },
  FOULS_DRAWN: { summary: ['foulsDrawn'], players: ['foulsDrawn'] },
  VALUATION: { summary: ['valuation'], players: ['valuation'] },
  PLUS_MINUS: { summary: ['plusMinus'], players: ['plusMinus'] },

  FG_MADE: { summary: ['fieldGoalsMade'], players: ['fieldGoalsMade'] },
  FG_ATTEMPTED: {
    summary: ['fieldGoalsAttempted'],
    players: ['fieldGoalsAttempted'],
  },
  FG_PCT: {
    summary: ['fieldGoalPct'],
    players: ['fieldGoalPct', 'fieldGoalsMade', 'fieldGoalsAttempted'],
  },
  TP_MADE: { summary: ['threePointersMade'], players: ['threePointersMade'] },
  TP_ATTEMPTED: {
    summary: ['threePointersAttempted'],
    players: ['threePointersAttempted'],
  },
  TP_PCT: {
    summary: ['threePointPct'],
    players: [
      'threePointPct',
      'threePointersMade',
      'threePointersAttempted',
    ],
  },
  FT_MADE: { summary: ['freeThrowsMade'], players: ['freeThrowsMade'] },
  FT_ATTEMPTED: {
    summary: ['freeThrowsAttempted'],
    players: ['freeThrowsAttempted'],
  },
  FT_PCT: {
    summary: ['freeThrowPct'],
    players: ['freeThrowPct', 'freeThrowsMade', 'freeThrowsAttempted'],
  },

  // ─── Jugador (basket) ───
  // Además de `players` (tabla del equipo / byMatch del jugador),
  // cubren también las mismas keys en el `summary` del payload
  // individual, para que el filtro no las elimine al usar scope PLAYER.
  MINUTES: { summary: ['minutes'], players: ['minutes'] },
  MINUTES_PER_MATCH_PLAYER: {
    summary: ['minutesPerMatch'],
    players: ['minutesPerMatch'],
  },
  POINTS_PLAYER: { summary: ['points'], players: ['points'] },
  POINTS_PER_MATCH_PLAYER: {
    summary: ['pointsPerMatch'],
    players: ['pointsPerMatch'],
  },
  AVAILABILITY: {
    summary: ['availabilityCount'],
    players: ['availabilityCount'],
  },
}

// ============================================
// PÁDEL
// ============================================

const PADEL_FIELDS: Record<string, MetricFieldMap> = {
  MATCHES: { summary: ['matches'] },
  WINS: { summary: ['wins'] },
  LOSSES: { summary: ['losses'] },
  DRAWS: { summary: ['draws'] },
  WIN_RATE: { summary: ['winRate'] },

  SUB_MATCHES_PLAYED: { summary: ['subMatchesPlayed'] },
  SUB_MATCHES_WON: { summary: ['subMatchesWon'] },
  SUB_MATCHES_LOST: { summary: ['subMatchesLost'] },
  SUB_MATCHES_DRAWN: { summary: ['subMatchesDrawn'] },

  SETS_PLAYED: { summary: ['setsPlayed'] },
  SETS_WON: { summary: ['setsWon'] },
  SETS_LOST: { summary: ['setsLost'] },
  SETS_DRAWN: { summary: ['setsDrawn'] },

  GAMES_WON: { summary: ['gamesWon'] },
  GAMES_LOST: { summary: ['gamesLost'] },
  GAMES_DIFF: { summary: ['gamesDiff'] },

  RESULT: {},
  TEAM_SCORE: {},
  SUB_MATCHES: {},

  // ─── Jugador (pádel) ───
  // Cubren también el `summary` del payload individual.
  PLAYER_MATCHES: {
    summary: ['matches'],
    players: ['matches'],
  },
  PLAYER_W_L_D: {
    summary: ['wins', 'losses', 'draws'],
    players: ['wins', 'losses', 'draws'],
  },
  AVAILABILITY: {
    summary: ['availabilityCount'],
    players: ['availabilityCount'],
  },
  PLAYER_WIN_RATE: {
    summary: ['winRate'],
    players: ['winRate'],
  },
  PLAYER_SUB_MATCHES: {
    summary: ['subMatchesWon', 'subMatchesLost', 'subMatchesDrawn'],
    players: ['subMatchesWon', 'subMatchesLost', 'subMatchesDrawn'],
  },
  PLAYER_SETS: {
    summary: ['setsWon', 'setsLost', 'setsDrawn'],
    players: ['setsWon', 'setsLost', 'setsDrawn'],
  },
  PLAYER_GAMES: {
    summary: ['gamesWon', 'gamesLost'],
    players: ['gamesWon', 'gamesLost'],
  },
  PLAYER_GAMES_DIFF: {
    summary: ['gamesDiff'],
    players: ['gamesDiff'],
  },
}

// ============================================
// API
// ============================================

function getFieldMap(sport: string): Record<string, MetricFieldMap> {
  if (sport === 'BASKETBALL') return BASKETBALL_FIELDS
  if (sport === 'PADEL') return PADEL_FIELDS
  return {}
}

export function buildVisibleKeys(
  sport: string,
  scope: StatsScope,
  viewerRole: StatsAudienceRole,
  configRows: Array<{
    scope: StatsScope
    role: StatsAudienceRole
    metricKey: string
    visible: boolean
  }>,
): Set<string> {
  const valid = getValidMetricKeys(sport, scope)
  const visible = new Set<string>(valid)

  for (const row of configRows) {
    if (row.scope !== scope) continue
    if (row.role !== viewerRole) continue
    if (!valid.has(row.metricKey)) continue
    if (row.visible) visible.add(row.metricKey)
    else visible.delete(row.metricKey)
  }

  return visible
}

export function filterStatsPayload<T extends {
  summary?: Record<string, any>
  teamSummary?: Record<string, any>
  players?: Array<Record<string, any>>
  byMatch?: Array<Record<string, any>>
}>(
  sport: string,
  visibleKeys: Set<string>,
  payload: T,
  /**
   * Nombre del campo del payload que contiene el array de filas "por partido"
   * o "por jugador". Por defecto 'players' (payload de equipo).
   * Para el payload individual de jugador se pasa 'byMatch'.
   */
  playersFieldName: 'players' | 'byMatch' = 'players',
): Set<string> {
  const fieldMap = getFieldMap(sport)

  const summaryKey: 'summary' | 'teamSummary' | null = payload.summary
    ? 'summary'
    : payload.teamSummary
    ? 'teamSummary'
    : null

  if (summaryKey) {
    const summaryObj = payload[summaryKey]!
    const toDelete: string[] = []
    for (const key of Object.keys(summaryObj)) {
      const coveringMetrics = Object.entries(fieldMap).filter(([, m]) =>
        (m.summary ?? []).includes(key),
      )
      if (coveringMetrics.length === 0) continue
      const anyVisible = coveringMetrics.some(([metricKey]) =>
        visibleKeys.has(metricKey),
      )
      if (!anyVisible) toDelete.push(key)
    }
    for (const k of toDelete) delete summaryObj[k]
  }

  const rows = (payload as any)[playersFieldName] as
    | Array<Record<string, any>>
    | undefined

  if (rows) {
    for (const row of rows) {
      const toDelete: string[] = []
      for (const key of Object.keys(row)) {
        const coveringMetrics = Object.entries(fieldMap).filter(([, m]) =>
          (m.players ?? []).includes(key),
        )
        if (coveringMetrics.length === 0) continue
        const anyVisible = coveringMetrics.some(([metricKey]) =>
          visibleKeys.has(metricKey),
        )
        if (!anyVisible) toDelete.push(key)
      }
      for (const k of toDelete) delete row[k]
    }
  }

  return visibleKeys
}

/**
 * Devuelve las métricas trendables para `sport`+`scope` que el viewer
 * puede ver según `visibleKeys`. El orden respeta el del registry.
 */
export function getAvailableTrendMetrics(
  sport: string,
  scope: StatsScope,
  visibleKeys: Set<string>,
): MetricDefinition[] {
  return getTrendableMetrics(sport, scope).filter((m) =>
    visibleKeys.has(m.key),
  )
}