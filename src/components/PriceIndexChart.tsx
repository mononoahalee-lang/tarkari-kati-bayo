'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, AreaSeries, TickMarkType, type IChartApi, type UTCTimestamp } from 'lightweight-charts'

export type IndexPoint = { date: string; avgPrice: number }

type Period = '1M' | '3M' | '1Y'

const PERIOD_DAYS: Record<Period, number> = { '1M': 30, '3M': 90, '1Y': 365 }

function filterByPeriod(data: IndexPoint[], period: Period) {
  const cutoff = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  return data.filter((d) => d.date >= cutoffStr)
}

interface Props {
  data: IndexPoint[]
  locale: string
}

export default function PriceIndexChart({ data, locale }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null)
  const [period, setPeriod] = useState<Period>('3M')

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      height: 220,
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
            y = String(dt.getUTCFullYear())
            mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
            d = String(dt.getUTCDate()).padStart(2, '0')
          } else if (typeof t === 'string') {
            ;[y, mo, d] = t.split('-')
          } else {
            const bd = t as { year: number; month: number; day: number }
            y = String(bd.year)
            mo = String(bd.month).padStart(2, '0')
            d = String(bd.day).padStart(2, '0')
          }
          if (tickMarkType === TickMarkType.Year) return y
          if (tickMarkType === TickMarkType.Month) return `${y}/${mo}`
          return `${mo}/${d}`
        },
      },
    })
    chartRef.current = chart

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#22c55e',
      topColor: 'rgba(34, 197, 94, 0.25)',
      bottomColor: 'rgba(34, 197, 94, 0.02)',
      lineWidth: 2,
    })
    seriesRef.current = series

    const initial = filterByPeriod(data, '3M')
    series.setData(initial.map((d) => ({ time: d.date, value: d.avgPrice })))
    chart.timeScale().fitContent()

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    chart.applyOptions({ width: containerRef.current.clientWidth })

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, []) // chart is created once; series updates are handled by the effect below

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return
    const filtered = filterByPeriod(data, period)
    seriesRef.current.setData(filtered.map((d: IndexPoint) => ({ time: d.date, value: d.avgPrice })))
    chartRef.current.timeScale().fitContent()
  }, [period, data])

  const filtered = filterByPeriod(data, period)
  const currentValue = filtered.length > 0 ? filtered[filtered.length - 1].avgPrice : null
  const startValue = filtered.length > 0 ? filtered[0].avgPrice : null
  const changePct =
    currentValue !== null && startValue !== null && startValue > 0
      ? ((currentValue - startValue) / startValue) * 100
      : null

  const title =
    locale === 'ne'
      ? 'नेपाल तरकारी औसत थोक मूल्य'
      : locale === 'ja'
      ? 'ネパール野菜平均卸売価格'
      : 'Nepal Vegetable Avg. Wholesale Price'

  const periodLabels: Record<Period, string> =
    locale === 'ne'
      ? { '1M': '१ म', '3M': '३ म', '1Y': '१ व' }
      : locale === 'ja'
      ? { '1M': '1ヶ月', '3M': '3ヶ月', '1Y': '1年' }
      : { '1M': '1M', '3M': '3M', '1Y': '1Y' }

  if (data.length === 0) return null

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{title}</p>
          {currentValue !== null && (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-mono font-bold text-zinc-100">
                NPR {currentValue.toFixed(2)}
              </span>
              {changePct !== null && (
                <span
                  className={`text-sm font-mono font-medium ${
                    changePct >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {changePct >= 0 ? '+' : ''}
                  {changePct.toFixed(2)}%
                </span>
              )}
              <span className="text-xs text-zinc-600 font-mono">
                {locale === 'ne'
                  ? `/ स्थिर टोकरी औसत`
                  : locale === 'ja'
                  ? '/ 固定バスケット平均'
                  : '/ fixed basket avg'}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0 mt-1">
          {(['1M', '3M', '1Y'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-green-700 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  )
}
