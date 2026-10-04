import { buildMonthlySeries, TrendMatchInput } from './trend.helper'
import type { MetricDefinition } from './metric-registry'

const metric = (partial: Partial<MetricDefinition>): MetricDefinition => ({
  key: 'X',
  sport: 'BASKETBALL',
  scopes: ['TEAM'],
  label: 'X',
  group: 'x',
  defaultVisible: true,
  trendable: true,
  trendKey: 'x',
  trendLabel: 'X',
  aggregation: 'sum',
  unit: 'u',
  ...partial,
})

const d = (iso: string) => new Date(iso)

describe('buildMonthlySeries — sum', () => {
  it('suma valores por mes', () => {
    const input: TrendMatchInput[] = [
      { date: d('2026-01-05'), values: { points: 10 } },
      { date: d('2026-01-20'), values: { points: 20 } },
      { date: d('2026-02-02'), values: { points: 5 } },
    ]
    const series = buildMonthlySeries(input, metric({ trendKey: 'points', aggregation: 'sum' }))
    expect(series).toEqual([
      { month: '2026-01', value: 30 },
      { month: '2026-02', value: 5 },
    ])
  })

  it('ordena meses ascendentemente aunque lleguen desordenados', () => {
    const input: TrendMatchInput[] = [
      { date: d('2026-03-01'), values: { x: 1 } },
      { date: d('2026-01-01'), values: { x: 2 } },
    ]
    const series = buildMonthlySeries(input, metric({ trendKey: 'x' }))
    expect(series.map((p) => p.month)).toEqual(['2026-01', '2026-03'])
  })

  it('devuelve [] si no hay partidos', () => {
    expect(buildMonthlySeries([], metric({}))).toEqual([])
  })

  it('devuelve [] si la métrica no tiene trendKey', () => {
    expect(
      buildMonthlySeries(
        [{ date: d('2026-01-01'), values: { x: 1 } }],
        metric({ trendKey: undefined }),
      ),
    ).toEqual([])
  })
})

describe('buildMonthlySeries — avg', () => {
  it('promedia por partido del mes', () => {
    const input: TrendMatchInput[] = [
      { date: d('2026-01-05'), values: { pointsPerMatch: 80 } },
      { date: d('2026-01-20'), values: { pointsPerMatch: 100 } },
      { date: d('2026-02-02'), values: { pointsPerMatch: 60 } },
    ]
    const series = buildMonthlySeries(
      input,
      metric({ trendKey: 'pointsPerMatch', aggregation: 'avg' }),
    )
    expect(series).toEqual([
      { month: '2026-01', value: 90 },
      { month: '2026-02', value: 60 },
    ])
  })
})

describe('buildMonthlySeries — ratio', () => {
  it('agrega numerador y denominador por mes y multiplica por 100', () => {
    const input: TrendMatchInput[] = [
      {
        date: d('2026-01-05'),
        values: { __ratioNum_winRate: 1, __ratioDen_winRate: 1 },
      },
      {
        date: d('2026-01-20'),
        values: { __ratioNum_winRate: 0, __ratioDen_winRate: 1 },
      },
      {
        date: d('2026-02-02'),
        values: { __ratioNum_winRate: 1, __ratioDen_winRate: 1 },
      },
    ]
    const series = buildMonthlySeries(
      input,
      metric({ trendKey: 'winRate', aggregation: 'ratio' }),
    )
    expect(series).toEqual([
      { month: '2026-01', value: 50 },
      { month: '2026-02', value: 100 },
    ])
  })

  it('devuelve 0 si el denominador del mes es 0', () => {
    const input: TrendMatchInput[] = [
      {
        date: d('2026-01-05'),
        values: { __ratioNum_winRate: 1, __ratioDen_winRate: 0 },
      },
    ]
    const series = buildMonthlySeries(
      input,
      metric({ trendKey: 'winRate', aggregation: 'ratio' }),
    )
    expect(series).toEqual([{ month: '2026-01', value: 0 }])
  })
})