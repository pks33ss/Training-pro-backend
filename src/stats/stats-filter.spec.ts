import { StatsScope } from '@prisma/client'
import { buildVisibleKeys, filterStatsPayload } from './stats-filter'

describe('buildVisibleKeys', () => {
  const emptyConfig: Array<{
    scope: StatsScope
    role: 'PLAYER' | 'COACH' | 'ASSISTANT' | 'ADMIN_TEAM' | 'VISITOR'
    metricKey: string
    visible: boolean
  }> = []

  it('devuelve todas las claves válidas del scope si no hay config', () => {
    const keys = buildVisibleKeys(
      'BASKETBALL',
      'TEAM',
      'PLAYER',
      emptyConfig,
    )
    expect(keys.has('POINTS')).toBe(true)
    expect(keys.has('REBOUNDS')).toBe(true)
    expect(keys.has('MATCHES')).toBe(true)
  })

  it('oculta las métricas con visible=false para el rol dado', () => {
    const keys = buildVisibleKeys('BASKETBALL', 'TEAM', 'PLAYER', [
      { scope: 'TEAM', role: 'PLAYER', metricKey: 'POINTS', visible: false },
    ])
    expect(keys.has('POINTS')).toBe(false)
    expect(keys.has('REBOUNDS')).toBe(true)
  })

  it('ignora filas de otro scope', () => {
    const keys = buildVisibleKeys('BASKETBALL', 'TEAM', 'PLAYER', [
      { scope: 'MATCH', role: 'PLAYER', metricKey: 'POINTS', visible: false },
    ])
    expect(keys.has('POINTS')).toBe(true)
  })

  it('ignora filas de otro rol', () => {
    const keys = buildVisibleKeys('BASKETBALL', 'TEAM', 'PLAYER', [
      { scope: 'TEAM', role: 'COACH', metricKey: 'POINTS', visible: false },
    ])
    expect(keys.has('POINTS')).toBe(true)
  })

  it('ignora metricKeys inválidos para el sport/scope', () => {
    const keys = buildVisibleKeys('BASKETBALL', 'TEAM', 'PLAYER', [
      // 'REBOUNDS' es válido, 'INVENT' no existe
      { scope: 'TEAM', role: 'PLAYER', metricKey: 'INVENT', visible: false },
    ])
    // No peta, simplemente ignora la fila
    expect(keys.has('POINTS')).toBe(true)
  })

  it('devuelve un set vacío si no hay métricas para el sport', () => {
    const keys = buildVisibleKeys('FOOTBALL', 'TEAM', 'PLAYER', emptyConfig)
    expect(keys.size).toBe(0)
  })
})

describe('filterStatsPayload', () => {
  it('no borra campos no mapeados (name, lastName)', () => {
    const payload = {
      summary: { points: 10 },
      players: [{ name: 'Ana', lastName: 'García', points: 10 }],
    }
    filterStatsPayload('BASKETBALL', new Set(['MATCHES']), payload)
    expect(payload.players[0].name).toBe('Ana')
    expect(payload.players[0].lastName).toBe('García')
  })

  it('borra campos del summary si su métrica está oculta', () => {
    const payload = {
      summary: { points: 10, rebounds: 5 },
      players: [],
    }
    filterStatsPayload('BASKETBALL', new Set(['REBOUNDS']), payload)
    expect(payload.summary.points).toBeUndefined()
    expect(payload.summary.rebounds).toBe(5)
  })

  it('borra campos de cada player si su métrica está oculta', () => {
    const payload = {
      summary: {},
      players: [
        { name: 'Ana', points: 10, rebounds: 3 },
        { name: 'Bea', points: 20, rebounds: 7 },
      ],
    }
    filterStatsPayload('BASKETBALL', new Set(['POINTS']), payload)
    expect(payload.players[0].points).toBe(10)
    expect(payload.players[0].rebounds).toBeUndefined()
    expect(payload.players[1].points).toBe(20)
    expect(payload.players[1].rebounds).toBeUndefined()
  })

  it('no toca trend ni match', () => {
    const payload = {
      summary: { points: 10 },
      players: [],
      trend: { byMonth: [{ month: '2026-01', winRate: 50 }] },
      match: { id: 'm1', opponent: 'X' },
    }
    filterStatsPayload('BASKETBALL', new Set(['REBOUNDS']), payload)
    expect(payload.trend.byMonth[0].winRate).toBe(50)
    expect(payload.match.id).toBe('m1')
  })

  it('conserva el campo si algún covering metric está visible (POINTS_PLAYER cubre summary y players)', () => {
  // `points` está cubierto por POINTS y POINTS_PLAYER, tanto en summary
  // como en players. Como POINTS_PLAYER está visible, no se borra en
  // ninguno de los dos sitios.
  const payload = {
    summary: { points: 10 },
    players: [{ name: 'A', points: 10 }],
  }
  filterStatsPayload('BASKETBALL', new Set(['POINTS_PLAYER']), payload)
  expect(payload.summary.points).toBe(10)
  expect(payload.players[0].points).toBe(10)
})

it('borra summary.points si NINGUNA métrica que lo cubre está visible', () => {
  const payload = {
    summary: { points: 10 },
    players: [{ name: 'A', points: 10 }],
  }
  // Ni POINTS ni POINTS_PLAYER visibles
  filterStatsPayload('BASKETBALL', new Set(['REBOUNDS']), payload)
  expect(payload.summary.points).toBeUndefined()
  expect(payload.players[0].points).toBeUndefined()
})

  it('acepta teamSummary como alias de summary', () => {
    const payload = {
      teamSummary: { points: 10, rebounds: 5 },
      players: [{ name: 'A', points: 10, rebounds: 3 }],
    }
    filterStatsPayload('BASKETBALL', new Set(['REBOUNDS']), payload)
    expect(payload.teamSummary.points).toBeUndefined()
    expect(payload.teamSummary.rebounds).toBe(5)
    expect(payload.players[0].points).toBeUndefined()
    expect(payload.players[0].rebounds).toBe(3)
  })

  it('si summary no existe, no peta', () => {
    const payload = {
      players: [{ name: 'A', points: 10 }],
    }
    expect(() =>
      filterStatsPayload('BASKETBALL', new Set(['REBOUNDS']), payload),
    ).not.toThrow()
  })
})

import { getAvailableTrendMetrics } from './stats-filter'

describe('getAvailableTrendMetrics', () => {
  it('devuelve solo las trendables visibles para el rol', () => {
    const all = getAvailableTrendMetrics(
      'BASKETBALL',
      'TEAM',
      new Set([
        'WIN_RATE',
        'MATCHES',
        'WINS',
        'LOSSES',
        'POINTS',
        'POINTS_PER_MATCH',
        'REBOUNDS',
        'REBOUNDS_PER_MATCH',
        'ASSISTS',
        'ASSISTS_PER_MATCH',
        'STEALS',
        'STEALS_PER_MATCH',
        'BLOCKS',
        'BLOCKS_PER_MATCH',
        'TURNOVERS',
        'TURNOVERS_PER_MATCH',
        'VALUATION',
        'VALUATION_PER_MATCH',
        'FG_PCT',
        'TP_PCT',
        'FT_PCT',
      ]),
    )
    const keys = all.map((m) => m.trendKey)
    expect(keys).toContain('winRate')
    expect(keys).toContain('pointsPerMatch')
    expect(keys).toContain('reboundsPerMatch')
  })

  it('excluye las trendables que el rol no puede ver', () => {
    const all = getAvailableTrendMetrics(
      'BASKETBALL',
      'TEAM',
      new Set(['WIN_RATE']),
    )
    const keys = all.map((m) => m.trendKey)
    expect(keys).toEqual(['winRate'])
  })

  it('devuelve [] si el rol no ve ninguna trendable', () => {
    const all = getAvailableTrendMetrics('BASKETBALL', 'TEAM', new Set())
    expect(all).toEqual([])
  })

  it('funciona también en PADEL', () => {
    const all = getAvailableTrendMetrics(
      'PADEL',
      'TEAM',
      new Set(['WIN_RATE', 'SETS_WON', 'GAMES_DIFF']),
    )
    const keys = all.map((m) => m.trendKey)
    expect(keys).toEqual(['winRate', 'setsWon', 'gamesDiff'])
  })
})
it('con playersFieldName=byMatch, summary conserva points si POINTS_PLAYER está visible', () => {
  const payload = {
    summary: { points: 18, minutesPerMatch: 22, pointsPerMatch: 18 },
    byMatch: [
      { matchId: 'm1', points: 18, minutesPerMatch: 22, pointsPerMatch: 18 },
    ],
  }
  filterStatsPayload(
    'BASKETBALL',
    new Set(['POINTS_PLAYER', 'MINUTES_PER_MATCH_PLAYER', 'POINTS_PER_MATCH_PLAYER']),
    payload,
    'byMatch',
  )
  expect(payload.summary.points).toBe(18)
  expect(payload.summary.pointsPerMatch).toBe(18)
  expect(payload.summary.minutesPerMatch).toBe(22)
  expect(payload.byMatch[0].points).toBe(18)
  expect(payload.byMatch[0].pointsPerMatch).toBe(18)
  expect(payload.byMatch[0].minutesPerMatch).toBe(22)
})

it('con playersFieldName=byMatch, summary borra points si POINTS_PLAYER NO está visible', () => {
  const payload = {
    summary: { points: 18, minutesPerMatch: 22, pointsPerMatch: 18 },
    byMatch: [
      { matchId: 'm1', points: 18, minutesPerMatch: 22, pointsPerMatch: 18 },
    ],
  }
  filterStatsPayload(
    'BASKETBALL',
    new Set(['REBOUNDS']),
    payload,
    'byMatch',
  )
  expect(payload.summary.points).toBeUndefined()
  expect(payload.summary.pointsPerMatch).toBeUndefined()
  expect(payload.summary.minutesPerMatch).toBeUndefined()
  expect(payload.byMatch[0].points).toBeUndefined()
  expect(payload.byMatch[0].pointsPerMatch).toBeUndefined()
  expect(payload.byMatch[0].minutesPerMatch).toBeUndefined()
})