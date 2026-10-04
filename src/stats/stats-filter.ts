import { StatsAudienceRole, StatsScope } from '@prisma/client'
import { getValidMetricKeys } from './metric-registry'

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

  MINUTES: { players: ['minutes'] },
  MINUTES_PER_MATCH_PLAYER: { players: ['minutesPerMatch'] },
  POINTS_PLAYER: { players: ['points'] },
  POINTS_PER_MATCH_PLAYER: { players: ['pointsPerMatch'] },
  AVAILABILITY: { players: ['availabilityCount'] },
}

// ============================================
// PÁDEL
// ============================================

const PADEL_FIELDS: Record<string, MetricFieldMap> = {
  // Equipo (summary agregado + resumen del partido)
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

  // Específicas del partido
  RESULT: {},
  TEAM_SCORE: {},
  SUB_MATCHES: {},

  // Jugador
  PLAYER_MATCHES: { players: ['matches'] },
  PLAYER_W_L_D: { players: ['wins', 'losses', 'draws'] },
  AVAILABILITY: { players: ['availabilityCount'] },
  PLAYER_WIN_RATE: { players: ['winRate'] },
  PLAYER_SUB_MATCHES: {
    players: ['subMatchesWon', 'subMatchesLost', 'subMatchesDrawn'],
  },
  PLAYER_SETS: { players: ['setsWon', 'setsLost', 'setsDrawn'] },
  PLAYER_GAMES: { players: ['gamesWon', 'gamesLost'] },
  PLAYER_GAMES_DIFF: { players: ['gamesDiff'] },
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
}>(
  sport: string,
  visibleKeys: Set<string>,
  payload: T,
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

  if (payload.players) {
    for (const player of payload.players) {
      const toDelete: string[] = []
      for (const key of Object.keys(player)) {
        const coveringMetrics = Object.entries(fieldMap).filter(([, m]) =>
          (m.players ?? []).includes(key),
        )
        if (coveringMetrics.length === 0) continue
        const anyVisible = coveringMetrics.some(([metricKey]) =>
          visibleKeys.has(metricKey),
        )
        if (!anyVisible) toDelete.push(key)
      }
      for (const k of toDelete) delete player[k]
    }
  }

  return visibleKeys
}