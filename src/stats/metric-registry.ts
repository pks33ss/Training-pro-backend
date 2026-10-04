import { StatsScope } from '@prisma/client'

export type MetricSport = 'BASKETBALL' | 'PADEL'

export type TrendAggregation = 'sum' | 'avg' | 'ratio'

export interface MetricDefinition {
  key: string
  sport: MetricSport
  scopes: StatsScope[]
  label: string
  group: string
  defaultVisible: boolean
  computed?: boolean

  // ─── Trend (Fase 3.3) ─────────────────────────────────────
  trendable?: boolean
  trendKey?: string
  trendLabel?: string
  aggregation?: TrendAggregation
  unit?: string
}

// ============================================
// BALONCESTO
// ============================================

const BASKETBALL_METRICS: MetricDefinition[] = [
  // Equipo (summary) + jugador (tabla). Aplican a TEAM, MATCH y PLAYER.
  { key: 'MATCHES', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: 'Partidos jugados', group: 'equipo', defaultVisible: true,
    trendable: true, trendKey: 'matchesPlayed', trendLabel: 'Partidos jugados', aggregation: 'sum', unit: 'partidos' },
  { key: 'WINS', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: 'Victorias', group: 'equipo', defaultVisible: true,
    trendable: true, trendKey: 'wins', trendLabel: 'Victorias', aggregation: 'sum', unit: 'partidos' },
  { key: 'LOSSES', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: 'Derrotas', group: 'equipo', defaultVisible: true,
    trendable: true, trendKey: 'losses', trendLabel: 'Derrotas', aggregation: 'sum', unit: 'partidos' },
  { key: 'DRAWS', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: 'Empates', group: 'equipo', defaultVisible: true },
  { key: 'WIN_RATE', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: '% Victorias', group: 'equipo', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'winRate', trendLabel: '% Victorias', aggregation: 'ratio', unit: '%' },

  { key: 'POINTS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Puntos', group: 'equipo', defaultVisible: true,
    trendable: true, trendKey: 'points', trendLabel: 'Puntos (total)', aggregation: 'sum', unit: 'pts' },
  { key: 'OPPONENT_POINTS', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos rival', group: 'equipo', defaultVisible: true,
    trendable: true, trendKey: 'opponentPoints', trendLabel: 'Puntos rival (total)', aggregation: 'sum', unit: 'pts' },
  { key: 'POINTS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos / partido', group: 'equipo', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'pointsPerMatch', trendLabel: 'Puntos / partido', aggregation: 'avg', unit: 'pts' },
  { key: 'OPPONENT_POINTS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos rival / partido', group: 'equipo', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'opponentPointsPerMatch', trendLabel: 'Puntos rival / partido', aggregation: 'avg', unit: 'pts' },
  { key: 'TOTAL_MINUTES', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Minutos (total)', group: 'equipo', defaultVisible: true },
  { key: 'MINUTES_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Minutos / partido', group: 'equipo', defaultVisible: true, computed: true },

  { key: 'REBOUNDS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Rebotes', group: 'defensa', defaultVisible: true,
    trendable: true, trendKey: 'rebounds', trendLabel: 'Rebotes (total)', aggregation: 'sum', unit: 'reb' },
  { key: 'REBOUNDS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Rebotes / partido', group: 'defensa', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'reboundsPerMatch', trendLabel: 'Rebotes / partido', aggregation: 'avg', unit: 'reb' },
  { key: 'ASSISTS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Asistencias', group: 'ataque', defaultVisible: true,
    trendable: true, trendKey: 'assists', trendLabel: 'Asistencias (total)', aggregation: 'sum', unit: 'ast' },
  { key: 'ASSISTS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Asistencias / partido', group: 'ataque', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'assistsPerMatch', trendLabel: 'Asistencias / partido', aggregation: 'avg', unit: 'ast' },
  { key: 'STEALS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Robos', group: 'defensa', defaultVisible: true,
    trendable: true, trendKey: 'steals', trendLabel: 'Robos (total)', aggregation: 'sum', unit: 'rob' },
  { key: 'STEALS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Robos / partido', group: 'defensa', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'stealsPerMatch', trendLabel: 'Robos / partido', aggregation: 'avg', unit: 'rob' },
  { key: 'BLOCKS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Tapones', group: 'defensa', defaultVisible: true,
    trendable: true, trendKey: 'blocks', trendLabel: 'Tapones (total)', aggregation: 'sum', unit: 'tap' },
  { key: 'BLOCKS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Tapones / partido', group: 'defensa', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'blocksPerMatch', trendLabel: 'Tapones / partido', aggregation: 'avg', unit: 'tap' },
  { key: 'BLOCKS_AGAINST', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Tapones contra', group: 'defensa', defaultVisible: true },
  { key: 'TURNOVERS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Pérdidas', group: 'ataque', defaultVisible: true,
    trendable: true, trendKey: 'turnovers', trendLabel: 'Pérdidas (total)', aggregation: 'sum', unit: 'per' },
  { key: 'TURNOVERS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Pérdidas / partido', group: 'ataque', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'turnoversPerMatch', trendLabel: 'Pérdidas / partido', aggregation: 'avg', unit: 'per' },
  { key: 'FOULS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Faltas cometidas', group: 'defensa', defaultVisible: true },
  { key: 'FOULS_DRAWN', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Faltas recibidas', group: 'ataque', defaultVisible: true },
  { key: 'VALUATION', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Valoración', group: 'equipo', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'valuation', trendLabel: 'Valoración (total)', aggregation: 'sum', unit: 'val' },
  { key: 'VALUATION_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Valoración / partido', group: 'equipo', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'valuationPerMatch', trendLabel: 'Valoración / partido', aggregation: 'avg', unit: 'val' },
  { key: 'PLUS_MINUS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: '+/-', group: 'equipo', defaultVisible: true },

  { key: 'FG_MADE', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Tiros de campo anotados', group: 'tiros', defaultVisible: true },
  { key: 'FG_ATTEMPTED', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Tiros de campo intentados', group: 'tiros', defaultVisible: true },
  { key: 'FG_PCT', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: '% Tiros de campo', group: 'tiros', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'fgPct', trendLabel: '% Tiros de campo', aggregation: 'ratio', unit: '%' },
  { key: 'TP_MADE', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Triples anotados', group: 'tiros', defaultVisible: true },
  { key: 'TP_ATTEMPTED', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Triples intentados', group: 'tiros', defaultVisible: true },
  { key: 'TP_PCT', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: '% Triples', group: 'tiros', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'tpPct', trendLabel: '% Triples', aggregation: 'ratio', unit: '%' },
  { key: 'FT_MADE', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Tiros libres anotados', group: 'tiros', defaultVisible: true },
  { key: 'FT_ATTEMPTED', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Tiros libres intentados', group: 'tiros', defaultVisible: true },
  { key: 'FT_PCT', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: '% Tiros libres', group: 'tiros', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'ftPct', trendLabel: '% Tiros libres', aggregation: 'ratio', unit: '%' },
  { key: 'MINUTES', sport: 'BASKETBALL', scopes: ['MATCH', 'TEAM', 'PLAYER'], label: 'Minutos (jugador)', group: 'jugador', defaultVisible: true },

  { key: 'MINUTES_PER_MATCH_PLAYER', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: 'Minutos/partido (jugador)', group: 'jugador', defaultVisible: true, computed: true },
     { key: 'POINTS_PLAYER', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: 'Puntos (jugador)', group: 'jugador', defaultVisible: true,
    trendable: true, trendKey: 'playerPoints', trendLabel: 'Puntos (jugador)', aggregation: 'sum', unit: 'pts' },
  { key: 'POINTS_PER_MATCH_PLAYER', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: 'Puntos/partido (jugador)', group: 'jugador', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'playerPointsPerMatch', trendLabel: 'Puntos / partido (jugador)', aggregation: 'avg', unit: 'pts' },
  { key: 'AVAILABILITY', sport: 'BASKETBALL', scopes: ['TEAM', 'PLAYER'], label: 'Disponibilidad (X/Y)', group: 'jugador', defaultVisible: true, computed: true },
]

// ============================================
// PÁDEL
// ============================================

const PADEL_METRICS: MetricDefinition[] = [
  // Resumen del equipo (agregado). También aplican a la hoja del partido.
  { key: 'MATCHES', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: 'Partidos jugados', group: 'equipo', defaultVisible: true,
    trendable: true, trendKey: 'matchesPlayed', trendLabel: 'Partidos jugados', aggregation: 'sum', unit: 'partidos' },
  { key: 'WINS', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: 'Victorias', group: 'equipo', defaultVisible: true,
    trendable: true, trendKey: 'wins', trendLabel: 'Victorias', aggregation: 'sum', unit: 'partidos' },
  { key: 'LOSSES', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: 'Derrotas', group: 'equipo', defaultVisible: true,
    trendable: true, trendKey: 'losses', trendLabel: 'Derrotas', aggregation: 'sum', unit: 'partidos' },
  { key: 'DRAWS', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: 'Empates', group: 'equipo', defaultVisible: true },
  { key: 'WIN_RATE', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: '% Victorias', group: 'equipo', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'winRate', trendLabel: '% Victorias', aggregation: 'ratio', unit: '%' },

  { key: 'SUB_MATCHES_PLAYED', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Pistas jugadas', group: 'pistas', defaultVisible: true },
  { key: 'SUB_MATCHES_WON', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Pistas ganadas', group: 'pistas', defaultVisible: true,
    trendable: true, trendKey: 'subMatchesWon', trendLabel: 'Pistas ganadas', aggregation: 'sum', unit: 'pistas' },
  { key: 'SUB_MATCHES_LOST', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Pistas perdidas', group: 'pistas', defaultVisible: true,
    trendable: true, trendKey: 'subMatchesLost', trendLabel: 'Pistas perdidas', aggregation: 'sum', unit: 'pistas' },
  { key: 'SUB_MATCHES_DRAWN', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Pistas empatadas', group: 'pistas', defaultVisible: true },

  { key: 'SETS_PLAYED', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Sets jugados', group: 'sets', defaultVisible: true,
    trendable: true, trendKey: 'setsPlayed', trendLabel: 'Sets jugados', aggregation: 'sum', unit: 'sets' },
  { key: 'SETS_WON', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Sets ganados', group: 'sets', defaultVisible: true,
    trendable: true, trendKey: 'setsWon', trendLabel: 'Sets ganados', aggregation: 'sum', unit: 'sets' },
  { key: 'SETS_LOST', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Sets perdidos', group: 'sets', defaultVisible: true,
    trendable: true, trendKey: 'setsLost', trendLabel: 'Sets perdidos', aggregation: 'sum', unit: 'sets' },
  { key: 'SETS_DRAWN', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Sets empatados', group: 'sets', defaultVisible: true },

  { key: 'GAMES_WON', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Games ganados', group: 'games', defaultVisible: true,
    trendable: true, trendKey: 'gamesWon', trendLabel: 'Games ganados', aggregation: 'sum', unit: 'games' },
  { key: 'GAMES_LOST', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Games perdidos', group: 'games', defaultVisible: true,
    trendable: true, trendKey: 'gamesLost', trendLabel: 'Games perdidos', aggregation: 'sum', unit: 'games' },
  { key: 'GAMES_DIFF', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Diferencia games', group: 'games', defaultVisible: true, computed: true,
    trendable: true, trendKey: 'gamesDiff', trendLabel: 'Diferencia games', aggregation: 'sum', unit: 'games' },

  // Específicas del MATCH
  { key: 'RESULT', sport: 'PADEL', scopes: ['MATCH'], label: 'Resultado', group: 'partido', defaultVisible: true },
  { key: 'TEAM_SCORE', sport: 'PADEL', scopes: ['MATCH'], label: 'Marcador', group: 'partido', defaultVisible: true },
  { key: 'SUB_MATCHES', sport: 'PADEL', scopes: ['MATCH'], label: 'Pistas (detalle)', group: 'partido', defaultVisible: true },

  // Jugador: en TEAM se pinta la tabla resumen. En MATCH se pinta la tabla por partido. En PLAYER, la vista individual.
  { key: 'PLAYER_MATCHES', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: 'Partidos (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'PLAYER_W_L_D', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: 'W-L-D (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'AVAILABILITY', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: 'Disponibilidad (X/Y)', group: 'jugador', defaultVisible: true, computed: true },
  { key: 'PLAYER_WIN_RATE', sport: 'PADEL', scopes: ['TEAM', 'PLAYER'], label: '% Victorias (jugador)', group: 'jugador', defaultVisible: true, computed: true },
  { key: 'PLAYER_SUB_MATCHES', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Pistas (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'PLAYER_SETS', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Sets (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'PLAYER_GAMES', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Games (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'PLAYER_GAMES_DIFF', sport: 'PADEL', scopes: ['TEAM', 'MATCH', 'PLAYER'], label: 'Diferencia games (jugador)', group: 'jugador', defaultVisible: true, computed: true },
]

// ============================================
// API
// ============================================

const ALL_METRICS: MetricDefinition[] = [
  ...BASKETBALL_METRICS,
  ...PADEL_METRICS,
]

export function getMetricsForSport(sport: string): MetricDefinition[] {
  return ALL_METRICS.filter((m) => m.sport === sport)
}

export function getMetricsForSportAndScope(
  sport: string,
  scope: StatsScope,
): MetricDefinition[] {
  return getMetricsForSport(sport).filter((m) => m.scopes.includes(scope))
}

export function getValidMetricKeys(
  sport: string,
  scope: StatsScope,
): Set<string> {
  return new Set(
    getMetricsForSportAndScope(sport, scope).map((m) => m.key),
  )
}

export function findMetric(
  sport: string,
  key: string,
): MetricDefinition | null {
  return (
    ALL_METRICS.find((m) => m.sport === sport && m.key === key) ?? null
  )
}

// ─── Trend (Fase 3.3) ─────────────────────────────────────────

export function getTrendableMetrics(
  sport: string,
  scope: StatsScope,
): MetricDefinition[] {
  return getMetricsForSportAndScope(sport, scope).filter(
    (m) => m.trendable === true,
  )
}

export function findTrendMetric(
  sport: string,
  scope: StatsScope,
  trendKey: string,
): MetricDefinition | null {
  return (
    getTrendableMetrics(sport, scope).find(
      (m) => m.trendKey === trendKey,
    ) ?? null
  )
}