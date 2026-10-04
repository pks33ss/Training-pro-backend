import {
  getMetricsForSportAndScope,
  getTrendableMetrics,
  findTrendMetric,
  findMetric,
} from './metric-registry'

describe('metric-registry — integridad de trend', () => {
  const sports = ['BASKETBALL', 'PADEL'] as const
  const scopes = ['TEAM', 'MATCH', 'PLAYER'] as const

  it('toda métrica trendable declara trendKey, trendLabel, aggregation y unit', () => {
    for (const sport of sports) {
      for (const scope of scopes) {
        const metrics = getMetricsForSportAndScope(sport, scope)
        for (const m of metrics) {
          if (m.trendable === true) {
            expect(m.trendKey).toBeTruthy()
            expect(m.trendLabel).toBeTruthy()
            expect(m.aggregation).toBeTruthy()
            expect(m.unit).toBeTruthy()
          }
        }
      }
    }
  })

  it('toda métrica NO trendable no declara campos de trend', () => {
    for (const sport of sports) {
      for (const scope of scopes) {
        const metrics = getMetricsForSportAndScope(sport, scope)
        for (const m of metrics) {
          if (m.trendable !== true) {
            expect(m.trendKey).toBeUndefined()
            expect(m.trendLabel).toBeUndefined()
            expect(m.aggregation).toBeUndefined()
            expect(m.unit).toBeUndefined()
          }
        }
      }
    }
  })

  it('trendKey es único dentro de sport+scope', () => {
    for (const sport of sports) {
      for (const scope of scopes) {
        const metrics = getTrendableMetrics(sport, scope)
        const keys = metrics.map((m) => m.trendKey)
        const unique = new Set(keys)
        expect(unique.size).toBe(keys.length)
      }
    }
  })
})

describe('getTrendableMetrics — BALONCESTO TEAM', () => {
  const metrics = getTrendableMetrics('BASKETBALL', 'TEAM')
  const keys = metrics.map((m) => m.trendKey)

  it('incluye winRate', () => {
    expect(keys).toContain('winRate')
  })

  it('incluye las variantes totales y per-match', () => {
    expect(keys).toContain('points')
    expect(keys).toContain('pointsPerMatch')
    expect(keys).toContain('rebounds')
    expect(keys).toContain('reboundsPerMatch')
    expect(keys).toContain('assists')
    expect(keys).toContain('assistsPerMatch')
    expect(keys).toContain('valuation')
    expect(keys).toContain('valuationPerMatch')
  })

  it('incluye los porcentajes', () => {
    expect(keys).toContain('fgPct')
    expect(keys).toContain('tpPct')
    expect(keys).toContain('ftPct')
  })

  it('NO incluye métricas no trendables como FG_MADE', () => {
    const metricKeys = metrics.map((m) => m.key)
    expect(metricKeys).not.toContain('FG_MADE')
    expect(metricKeys).not.toContain('TP_MADE')
    expect(metricKeys).not.toContain('DRAWS')
  })
})

describe('getTrendableMetrics — PÁDEL TEAM', () => {
  const metrics = getTrendableMetrics('PADEL', 'TEAM')
  const keys = metrics.map((m) => m.trendKey)

  it('incluye winRate', () => {
    expect(keys).toContain('winRate')
  })

  it('incluye sets, games y pistas', () => {
    expect(keys).toContain('setsWon')
    expect(keys).toContain('setsLost')
    expect(keys).toContain('gamesWon')
    expect(keys).toContain('gamesLost')
    expect(keys).toContain('gamesDiff')
    expect(keys).toContain('subMatchesWon')
    expect(keys).toContain('subMatchesLost')
  })

  it('NO incluye métricas de scope MATCH como RESULT', () => {
    const metricKeys = metrics.map((m) => m.key)
    expect(metricKeys).not.toContain('RESULT')
    expect(metricKeys).not.toContain('TEAM_SCORE')
  })
})

describe('findTrendMetric', () => {
  it('encuentra por trendKey en basket TEAM', () => {
    const m = findTrendMetric('BASKETBALL', 'TEAM', 'reboundsPerMatch')
    expect(m).not.toBeNull()
    expect(m?.key).toBe('REBOUNDS_PER_MATCH')
    expect(m?.aggregation).toBe('avg')
    expect(m?.unit).toBe('reb')
  })

  it('encuentra por trendKey en pádel TEAM', () => {
    const m = findTrendMetric('PADEL', 'TEAM', 'winRate')
    expect(m).not.toBeNull()
    expect(m?.key).toBe('WIN_RATE')
    expect(m?.aggregation).toBe('ratio')
  })

  it('devuelve null si el trendKey no existe', () => {
    expect(findTrendMetric('BASKETBALL', 'TEAM', 'invented')).toBeNull()
  })

  it('devuelve null si la métrica existe pero no es trendable', () => {
    expect(findTrendMetric('BASKETBALL', 'TEAM', 'fgMade')).toBeNull()
  })

  it('devuelve null si el scope no coincide', () => {
    expect(findTrendMetric('PADEL', 'TEAM', 'result')).toBeNull()
  })
})

describe('findMetric — no se rompe con las nuevas entradas', () => {
  it('encuentra las nuevas _PER_MATCH', () => {
    expect(findMetric('BASKETBALL', 'REBOUNDS_PER_MATCH')).not.toBeNull()
    expect(findMetric('BASKETBALL', 'ASSISTS_PER_MATCH')).not.toBeNull()
    expect(findMetric('BASKETBALL', 'VALUATION_PER_MATCH')).not.toBeNull()
  })

  it('las nuevas _PER_MATCH son visible por defecto', () => {
    const m = findMetric('BASKETBALL', 'REBOUNDS_PER_MATCH')
    expect(m?.defaultVisible).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────
// Fase 3.4 — scope PLAYER
// ───────────────────────────────────────────────────────────

describe('getMetricsForSportAndScope — BALONCESTO PLAYER', () => {
  const metrics = getMetricsForSportAndScope('BASKETBALL', 'PLAYER')
  const keys = metrics.map((m) => m.key)

  it('devuelve un conjunto no vacío', () => {
    expect(metrics.length).toBeGreaterThan(0)
  })

  it('incluye identificación del jugador (MATCHES, WINS, LOSSES, WIN_RATE)', () => {
    expect(keys).toContain('MATCHES')
    expect(keys).toContain('WINS')
    expect(keys).toContain('LOSSES')
    expect(keys).toContain('WIN_RATE')
  })

  it('incluye stats de jugador específicas (POINTS_PLAYER, MINUTES, etc.)', () => {
    expect(keys).toContain('POINTS_PLAYER')
    expect(keys).toContain('POINTS_PER_MATCH_PLAYER')
    expect(keys).toContain('MINUTES')
    expect(keys).toContain('MINUTES_PER_MATCH_PLAYER')
  })

  it('incluye las stats que hoy pinta la tabla de jugadores', () => {
    expect(keys).toContain('REBOUNDS')
    expect(keys).toContain('ASSISTS')
    expect(keys).toContain('STEALS')
    expect(keys).toContain('BLOCKS')
    expect(keys).toContain('TURNOVERS')
    expect(keys).toContain('VALUATION')
    expect(keys).toContain('FG_PCT')
    expect(keys).toContain('TP_PCT')
    expect(keys).toContain('FT_PCT')
    expect(keys).toContain('AVAILABILITY')
  })

  it('NO incluye métricas exclusivas del equipo (POINTS_PER_MATCH)', () => {
    expect(keys).not.toContain('POINTS_PER_MATCH')
    expect(keys).not.toContain('OPPONENT_POINTS')
    expect(keys).not.toContain('TOTAL_MINUTES')
  })
})

describe('getMetricsForSportAndScope — PÁDEL PLAYER', () => {
  const metrics = getMetricsForSportAndScope('PADEL', 'PLAYER')
  const keys = metrics.map((m) => m.key)

  it('devuelve un conjunto no vacío', () => {
    expect(metrics.length).toBeGreaterThan(0)
  })

  it('incluye identificación del jugador', () => {
    expect(keys).toContain('MATCHES')
    expect(keys).toContain('WINS')
    expect(keys).toContain('LOSSES')
    expect(keys).toContain('WIN_RATE')
    expect(keys).toContain('PLAYER_MATCHES')
    expect(keys).toContain('PLAYER_W_L_D')
    expect(keys).toContain('PLAYER_WIN_RATE')
  })

  it('incluye sets, games y pistas', () => {
    expect(keys).toContain('PLAYER_SUB_MATCHES')
    expect(keys).toContain('PLAYER_SETS')
    expect(keys).toContain('PLAYER_GAMES')
    expect(keys).toContain('PLAYER_GAMES_DIFF')
    expect(keys).toContain('SETS_WON')
    expect(keys).toContain('SETS_LOST')
    expect(keys).toContain('GAMES_WON')
    expect(keys).toContain('GAMES_LOST')
    expect(keys).toContain('GAMES_DIFF')
  })

  it('NO incluye métricas exclusivas del MATCH (RESULT, TEAM_SCORE)', () => {
    expect(keys).not.toContain('RESULT')
    expect(keys).not.toContain('TEAM_SCORE')
    expect(keys).not.toContain('SUB_MATCHES')
  })
})

describe('getTrendableMetrics — scope PLAYER', () => {
  it('en basket PLAYER incluye winRate y los contables de jugador', () => {
    const keys = getTrendableMetrics('BASKETBALL', 'PLAYER').map(
      (m) => m.trendKey,
    )
    expect(keys).toContain('winRate')
    expect(keys).toContain('rebounds')
    expect(keys).toContain('assists')
    expect(keys).toContain('valuation')
  })

  it('en pádel PLAYER incluye winRate y los contables de jugador', () => {
    const keys = getTrendableMetrics('PADEL', 'PLAYER').map(
      (m) => m.trendKey,
    )
    expect(keys).toContain('winRate')
    expect(keys).toContain('setsWon')
    expect(keys).toContain('gamesWon')
    expect(keys).toContain('gamesDiff')
  })

  it('findTrendMetric funciona en scope PLAYER', () => {
    const m = findTrendMetric('BASKETBALL', 'PLAYER', 'rebounds')
    expect(m).not.toBeNull()
    expect(m?.key).toBe('REBOUNDS')
  })
})

describe('getTrendableMetrics — BALONCESTO PLAYER incluye points', () => {
  it('playerPoints y playerPointsPerMatch son trendables en basket PLAYER', () => {
    const keys = getTrendableMetrics('BASKETBALL', 'PLAYER').map(
      (m) => m.trendKey,
    )
    expect(keys).toContain('playerPoints')
    expect(keys).toContain('playerPointsPerMatch')
  })

  it('no colisiona con el scope TEAM', () => {
    const playerKeys = getTrendableMetrics('BASKETBALL', 'PLAYER').map(
      (m) => m.trendKey,
    )
    const teamKeys = getTrendableMetrics('BASKETBALL', 'TEAM').map(
      (m) => m.trendKey,
    )
    expect(playerKeys).toContain('playerPoints')
    expect(teamKeys).toContain('playerPoints')
    // Y siguen existiendo los de equipo, sin colisión:
    expect(teamKeys).toContain('points')
    expect(teamKeys).toContain('pointsPerMatch')
  })
})