import type { MetricDefinition, TrendAggregation } from './metric-registry'

/**
 * Un punto de entrada por partido para construir la serie mensual.
 * `values` puede contener:
 *   - un valor directo para la trendKey (sum, avg)
 *   - o contadores auxiliares para ratios:
 *       `__ratioNum_<trendKey>` (numerador) y `__ratioDen_<trendKey>` (denominador)
 *     Ej: para winRate, __ratioNum_winRate = 1 si WIN, __ratioDen_winRate = 1 siempre.
 *     Para fgPct, __ratioNum_fgPct = FGM, __ratioDen_fgPct = FGA.
 */
export interface TrendMatchInput {
  date: Date
  values: Record<string, number>
}

export interface TrendSeriesPoint {
  month: string
  value: number
}

interface MonthAcc {
  month: string
  sum: number
  ratioNum: number
  ratioDen: number
  count: number
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Construye la serie mensual de una métrica trendable.
 * - `sum`: suma del valor por mes.
 * - `avg`: media del valor por partido del mes (suma / nº partidos con dato).
 * - `ratio`: num/den agregados del mes × 100 (asume porcentaje).
 *
 * Devuelve los meses ordenados ascendentemente.
 * Si no hay datos, devuelve [].
 */
export function buildMonthlySeries(
  perMatch: TrendMatchInput[],
  metric: MetricDefinition,
): TrendSeriesPoint[] {
  if (perMatch.length === 0) return []
  const trendKey = metric.trendKey
  if (!trendKey) return []
  const aggregation: TrendAggregation = metric.aggregation ?? 'sum'

  const map = new Map<string, MonthAcc>()

  for (const m of perMatch) {
    const key = monthKey(m.date)
    if (!map.has(key)) {
      map.set(key, {
        month: key,
        sum: 0,
        ratioNum: 0,
        ratioDen: 0,
        count: 0,
      })
    }
    const acc = map.get(key)!

    if (aggregation === 'ratio') {
      const num = m.values[`__ratioNum_${trendKey}`] ?? 0
      const den = m.values[`__ratioDen_${trendKey}`] ?? 0
      acc.ratioNum += num
      acc.ratioDen += den
    } else {
      const v = m.values[trendKey] ?? 0
      acc.sum += v
      acc.count += 1
    }
  }

  return Array.from(map.values())
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((acc) => {
      if (aggregation === 'sum') {
        return { month: acc.month, value: round1(acc.sum) }
      }
      if (aggregation === 'avg') {
        const value = acc.count > 0 ? acc.sum / acc.count : 0
        return { month: acc.month, value: round1(value) }
      }
      // ratio
      const value = acc.ratioDen > 0 ? (acc.ratioNum / acc.ratioDen) * 100 : 0
      return { month: acc.month, value: round1(value) }
    })
}