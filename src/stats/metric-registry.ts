import { StatsScope } from '@prisma/client'

export type MetricSport = 'BASKETBALL' | 'PADEL'

export interface MetricDefinition {
  key: string
  sport: MetricSport
  scopes: StatsScope[]
  label: string
  group: string
  defaultVisible: boolean
  computed?: boolean
}

// ============================================
// BALONCESTO
// ============================================

const BASKETBALL_METRICS: MetricDefinition[] = [
  // Equipo (summary) + jugador (tabla)
  { key: 'MATCHES', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Partidos jugados', group: 'equipo', defaultVisible: true },
  { key: 'WINS', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Victorias', group: 'equipo', defaultVisible: true },
  { key: 'LOSSES', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Derrotas', group: 'equipo', defaultVisible: true },
  { key: 'DRAWS', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Empates', group: 'equipo', defaultVisible: true },
  { key: 'WIN_RATE', sport: 'BASKETBALL', scopes: ['TEAM'], label: '% Victorias', group: 'equipo', defaultVisible: true, computed: true },

  { key: 'POINTS', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos (total)', group: 'equipo', defaultVisible: true },
  { key: 'OPPONENT_POINTS', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos rival (total)', group: 'equipo', defaultVisible: true },
  { key: 'POINTS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos / partido', group: 'equipo', defaultVisible: true, computed: true },
  { key: 'OPPONENT_POINTS_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos rival / partido', group: 'equipo', defaultVisible: true, computed: true },
  { key: 'TOTAL_MINUTES', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Minutos (total)', group: 'equipo', defaultVisible: true },
  { key: 'MINUTES_PER_MATCH', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Minutos / partido', group: 'equipo', defaultVisible: true, computed: true },

  { key: 'REBOUNDS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Rebotes', group: 'defensa', defaultVisible: true },
  { key: 'ASSISTS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Asistencias', group: 'ataque', defaultVisible: true },
  { key: 'STEALS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Robos', group: 'defensa', defaultVisible: true },
  { key: 'BLOCKS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Tapones', group: 'defensa', defaultVisible: true },
  { key: 'BLOCKS_AGAINST', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Tapones contra', group: 'defensa', defaultVisible: true },
  { key: 'TURNOVERS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Pérdidas', group: 'ataque', defaultVisible: true },
  { key: 'FOULS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Faltas cometidas', group: 'defensa', defaultVisible: true },
  { key: 'FOULS_DRAWN', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Faltas recibidas', group: 'ataque', defaultVisible: true },
  { key: 'VALUATION', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Valoración', group: 'equipo', defaultVisible: true, computed: true },
  { key: 'PLUS_MINUS', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: '+/-', group: 'equipo', defaultVisible: true },

  { key: 'FG_MADE', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Tiros de campo anotados', group: 'tiros', defaultVisible: true },
  { key: 'FG_ATTEMPTED', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Tiros de campo intentados', group: 'tiros', defaultVisible: true },
  { key: 'FG_PCT', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: '% Tiros de campo', group: 'tiros', defaultVisible: true, computed: true },
  { key: 'TP_MADE', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Triples anotados', group: 'tiros', defaultVisible: true },
  { key: 'TP_ATTEMPTED', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Triples intentados', group: 'tiros', defaultVisible: true },
  { key: 'TP_PCT', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: '% Triples', group: 'tiros', defaultVisible: true, computed: true },
  { key: 'FT_MADE', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Tiros libres anotados', group: 'tiros', defaultVisible: true },
  { key: 'FT_ATTEMPTED', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: 'Tiros libres intentados', group: 'tiros', defaultVisible: true },
  { key: 'FT_PCT', sport: 'BASKETBALL', scopes: ['TEAM', 'MATCH'], label: '% Tiros libres', group: 'tiros', defaultVisible: true, computed: true },
  { key: 'MINUTES', sport: 'BASKETBALL', scopes: ['MATCH', 'TEAM'], label: 'Minutos (jugador)', group: 'jugador', defaultVisible: true },
  
  { key: 'MINUTES_PER_MATCH_PLAYER', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Minutos/partido (jugador)', group: 'jugador', defaultVisible: true, computed: true },
  { key: 'POINTS_PLAYER', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'POINTS_PER_MATCH_PLAYER', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Puntos/partido (jugador)', group: 'jugador', defaultVisible: true, computed: true },
  { key: 'AVAILABILITY', sport: 'BASKETBALL', scopes: ['TEAM'], label: 'Disponibilidad (X/Y)', group: 'jugador', defaultVisible: true, computed: true },
]

// ============================================
// PÁDEL
// ============================================

const PADEL_METRICS: MetricDefinition[] = [
  // Equipo (summary)
  { key: 'MATCHES', sport: 'PADEL', scopes: ['TEAM'], label: 'Partidos jugados', group: 'equipo', defaultVisible: true },
  { key: 'WINS', sport: 'PADEL', scopes: ['TEAM'], label: 'Victorias', group: 'equipo', defaultVisible: true },
  { key: 'LOSSES', sport: 'PADEL', scopes: ['TEAM'], label: 'Derrotas', group: 'equipo', defaultVisible: true },
  { key: 'DRAWS', sport: 'PADEL', scopes: ['TEAM'], label: 'Empates', group: 'equipo', defaultVisible: true },
  { key: 'WIN_RATE', sport: 'PADEL', scopes: ['TEAM'], label: '% Victorias', group: 'equipo', defaultVisible: true, computed: true },

  { key: 'SUB_MATCHES_PLAYED', sport: 'PADEL', scopes: ['TEAM'], label: 'Pistas jugadas', group: 'pistas', defaultVisible: true },
  { key: 'SUB_MATCHES_WON', sport: 'PADEL', scopes: ['TEAM'], label: 'Pistas ganadas', group: 'pistas', defaultVisible: true },
  { key: 'SUB_MATCHES_LOST', sport: 'PADEL', scopes: ['TEAM'], label: 'Pistas perdidas', group: 'pistas', defaultVisible: true },
  { key: 'SUB_MATCHES_DRAWN', sport: 'PADEL', scopes: ['TEAM'], label: 'Pistas empatadas', group: 'pistas', defaultVisible: true },

  { key: 'SETS_PLAYED', sport: 'PADEL', scopes: ['TEAM'], label: 'Sets jugados', group: 'sets', defaultVisible: true },
  { key: 'SETS_WON', sport: 'PADEL', scopes: ['TEAM'], label: 'Sets ganados', group: 'sets', defaultVisible: true },
  { key: 'SETS_LOST', sport: 'PADEL', scopes: ['TEAM'], label: 'Sets perdidos', group: 'sets', defaultVisible: true },
  { key: 'SETS_DRAWN', sport: 'PADEL', scopes: ['TEAM'], label: 'Sets empatados', group: 'sets', defaultVisible: true },

  { key: 'GAMES_WON', sport: 'PADEL', scopes: ['TEAM'], label: 'Games ganados', group: 'games', defaultVisible: true },
  { key: 'GAMES_LOST', sport: 'PADEL', scopes: ['TEAM'], label: 'Games perdidos', group: 'games', defaultVisible: true },
  { key: 'GAMES_DIFF', sport: 'PADEL', scopes: ['TEAM'], label: 'Diferencia games', group: 'games', defaultVisible: true, computed: true },

  // Por partido (MATCH)
  { key: 'RESULT', sport: 'PADEL', scopes: ['MATCH'], label: 'Resultado', group: 'partido', defaultVisible: true },
  { key: 'TEAM_SCORE', sport: 'PADEL', scopes: ['MATCH'], label: 'Marcador', group: 'partido', defaultVisible: true },
  { key: 'SUB_MATCHES', sport: 'PADEL', scopes: ['MATCH'], label: 'Pistas (detalle)', group: 'partido', defaultVisible: true },

  // Jugador (TEAM: fila de tabla)
  { key: 'PLAYER_MATCHES', sport: 'PADEL', scopes: ['TEAM'], label: 'Partidos (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'PLAYER_W_L_D', sport: 'PADEL', scopes: ['TEAM'], label: 'W-L-D (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'AVAILABILITY', sport: 'PADEL', scopes: ['TEAM'], label: 'Disponibilidad (X/Y)', group: 'jugador', defaultVisible: true, computed: true },
  { key: 'PLAYER_WIN_RATE', sport: 'PADEL', scopes: ['TEAM'], label: '% Victorias (jugador)', group: 'jugador', defaultVisible: true, computed: true },
  { key: 'PLAYER_SUB_MATCHES', sport: 'PADEL', scopes: ['TEAM'], label: 'Pistas (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'PLAYER_SETS', sport: 'PADEL', scopes: ['TEAM'], label: 'Sets (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'PLAYER_GAMES', sport: 'PADEL', scopes: ['TEAM'], label: 'Games (jugador)', group: 'jugador', defaultVisible: true },
  { key: 'PLAYER_GAMES_DIFF', sport: 'PADEL', scopes: ['TEAM'], label: 'Diferencia games (jugador)', group: 'jugador', defaultVisible: true, computed: true },
]

// ============================================
// API
// ============================================

const ALL_METRICS: MetricDefinition[] = [
  ...BASKETBALL_METRICS,
  ...PADEL_METRICS,
]

/**
 * Todas las métricas de un deporte.
 */
export function getMetricsForSport(sport: string): MetricDefinition[] {
  return ALL_METRICS.filter((m) => m.sport === sport)
}

/**
 * Métricas de un deporte y un scope concretos.
 */
export function getMetricsForSportAndScope(
  sport: string,
  scope: StatsScope,
): MetricDefinition[] {
  return getMetricsForSport(sport).filter((m) => m.scopes.includes(scope))
}

/**
 * Set de claves válidas para un deporte y scope.
 * Se usa para validar PUT de config y para filtrar payloads.
 */
export function getValidMetricKeys(
  sport: string,
  scope: StatsScope,
): Set<string> {
  return new Set(
    getMetricsForSportAndScope(sport, scope).map((m) => m.key),
  )
}

/**
 * Busca una métrica por sport + key. Devuelve null si no existe.
 * Si una key existe en varios scopes, devuelve la primera coincidencia.
 */
export function findMetric(
  sport: string,
  key: string,
): MetricDefinition | null {
  return (
    ALL_METRICS.find((m) => m.sport === sport && m.key === key) ?? null
  )
}