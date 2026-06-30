'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, LineSeries, TickMarkType, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import type { Locale } from '@/types'

export type MarketHistoryPoint = {
  marketId: string
  marketNameEn: string
  marketNameNe: string
  district: string
  date: string
  minPrice: number
  maxPrice: number
  avgPrice: number
}

type Period = '1M' | '3M' | '1Y' | 'ALL'

const PERIOD_DAYS: Record<Exclude<Period, 'ALL'>, number> = { '1M': 30, '3M': 90, '1Y': 365 }

const COLORS = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308',
]

function filterByPeriod(data: MarketHistoryPoint[], period: Period) {
  if (period === 'ALL') return data
  const cutoff = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  return data.filter((d) => d.date >= cutoffStr)
}

function getMarketName(p: { marketNameEn: string; marketNameNe: string }, locale: Locale) {
  return locale === 'ne' ? p.marketNameNe : p.marketNameEn
}

const UI: Record<Locale, {
  noData: string; market: string; latest: string; low: string; high: string; lastUpdate: string
  periods: Record<Period, string>
}> = {
  ne: {
    noData: 'डेटा उपलब्ध छैन', market: 'बजार', latest: 'हालको मूल्य', low: 'न्यूनतम', high: 'अधिकतम', lastUpdate: 'अन्तिम अद्यावधिक',
    periods: { '1M': '१ म', '3M': '३ म', '1Y': '१ व', ALL: 'सबै' },
  },
  en: {
    noData: 'No data available', market: 'Market', latest: 'Latest', low: 'Low', high: 'High', lastUpdate: 'Last update',
    periods: { '1M': '1M', '3M': '3M', '1Y': '1Y', ALL: 'All' },
  },
  ja: {
    noData: 'データがありません', market: '市場', latest: '最新価格', low: '最安値', high: '最高値', lastUpdate: '最終更新',
    periods: { '1M': '1ヶ月', '3M': '3ヶ月', '1Y': '1年', ALL: '全期間' },
  },
}

interface Props {
  data: MarketHistoryPoint[]
  locale: Locale
}

export default function MultiMarketChart({ data, locale }: Props) {
  const ui = UI[locale]
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesMapRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const [period, setPeriod] = useState<Period>('3M')

  const marketIds = [...new Set(data.map((d) => d.marketId))]
  const marketMeta = new Map(marketIds.map((id) => [id, data.find((d) => d.marketId === id)!]))
  const colorFor = (marketId: string) => COLORS[marketIds.indexOf(marketId) % COLORS.length]

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      height: 360,
      layout: { background: { color: '#18181b' }, textColor: '#a1a1aa' },
      grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#3f3f46' },
      timeScale: {
        borderColor: '#3f3f46',
        tickMarkFormatter: (time: UTCTimestamp, tickMarkType: TickMarkType) => {
          const t = time as unknown
          let y: string, mo: string, d: string
          if (typeof t === 'number') {
            const dt = new Date(t * 1000)
            y = String(dt.getUTCFullYear()); mo = String(dt.getUTCMonth() + 1).padStart(2, '0'); d = String(dt.getUTCDate()).padStart(2, '0')
          } else if (typeof t === 'string') {
            ;[y, mo, d] = t.split('-')
          } else {
            const bd = t as { year: number; month: number; day: number }
            y = String(bd.year); mo = String(bd.month).padStart(2, '0'); d = String(bd.day).padStart(2, '0')
          }
          if (tickMarkType === TickMarkType.Year) return y
          if (tickMarkType === TickMarkType.Month) return `${y}/${mo}`
          return `${mo}/${d}`
        },
      },
    })
    chartRef.current = chart

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    chart.applyOptions({ width: containerRef.current.clientWidth })

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesMapRef.current = new Map()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    // Reconcile series with current market set instead of tearing the chart down each time
    for (const [marketId, series] of seriesMapRef.current) {
      if (!marketIds.includes(marketId)) {
        chart.removeSeries(series)
        seriesMapRef.current.delete(marketId)
      }
    }

    const filtered = filterByPeriod(data, period)

    for (const marketId of marketIds) {
      let series = seriesMapRef.current.get(marketId)
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: colorFor(marketId),
          lineWidth: 2,
        })
        seriesMapRef.current.set(marketId, series)
      }
      const points = filtered.filter((d) => d.marketId === marketId)
      series.setData(points.map((p) => ({ time: p.date, value: p.avgPrice })))
    }

    chart.timeScale().fitContent()
  }, [data, period]) // eslint-disable-line react-hooks/exhaustive-deps

  if (data.length === 0) {
    return <p className="text-sm text-zinc-500 py-8 text-center">{ui.noData}</p>
  }

  const filtered = filterByPeriod(data, period)
  const rows = marketIds.map((marketId) => {
    const points = filtered.filter((d) => d.marketId === marketId).sort((a, b) => a.date.localeCompare(b.date))
    const meta = marketMeta.get(marketId)!
    const latest = points[points.length - 1] ?? null
    const low = points.length > 0 ? Math.min(...points.map((p) => p.minPrice)) : null
    const high = points.length > 0 ? Math.max(...points.map((p) => p.maxPrice)) : null
    return { marketId, meta, latest, low, high }
  }).filter((r) => r.latest !== null)
    .sort((a, b) => (a.latest!.avgPrice) - (b.latest!.avgPrice))

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-end gap-1">
        {(['1M', '3M', '1Y', 'ALL'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              period === p ? 'bg-green-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {ui.periods[p]}
          </button>
        ))}
      </div>
      <div ref={containerRef} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-zinc-800 text-zinc-500 text-xs">
              <th className="text-left font-medium px-4 py-2">{ui.market}</th>
              <th className="text-right font-medium px-4 py-2">{ui.latest}</th>
              <th className="text-right font-medium px-4 py-2">{ui.low}</th>
              <th className="text-right font-medium px-4 py-2">{ui.high}</th>
              <th className="text-right font-medium px-4 py-2">{ui.lastUpdate}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.marketId} className="border-t border-zinc-800/60">
                <td className="px-4 py-2 text-zinc-200">
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: colorFor(r.marketId) }} />
                  {getMarketName(r.meta, locale)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-zinc-100">{r.latest!.avgPrice.toFixed(2)}</td>
                <td className="px-4 py-2 text-right font-mono text-zinc-500">{r.low}</td>
                <td className="px-4 py-2 text-right font-mono text-zinc-500">{r.high}</td>
                <td className="px-4 py-2 text-right font-mono text-zinc-500">{r.latest!.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
