'use client'

import { useState, useMemo } from 'react'
import type { Locale } from '@/types'

export type TomatoSeries = {
  id: string
  nameEn: string
  nameJa: string
  nameNe: string
  color: string
  data: Array<{ date: string; price: number }>
}

interface Props {
  series: TomatoSeries[]
  locale: Locale
}

const UI = {
  en: { title: 'Price Trend Comparison', toggle: 'Toggle varieties', noData: 'No multi-market data for this variety', period1M: '1M', period3M: '3M', priceLabel: 'NPR/kg' },
  ja: { title: '品種別価格推移', toggle: '品種を選択', noData: '複数市場データなし', period1M: '1ヶ月', period3M: '3ヶ月', priceLabel: 'NPR/kg' },
  ne: { title: 'मूल्य प्रवृत्ति तुलना', toggle: 'किसिम छान्नुहोस्', noData: 'बहु-बजार डेटा छैन', period1M: '१ म', period3M: '३ म', priceLabel: 'NPR/kg' },
}

function buildPath(
  data: Array<{ date: string; price: number }>,
  dateRange: [number, number],
  priceRange: [number, number],
  w: number,
  h: number,
): string {
  if (data.length < 2) return ''
  const [d0, d1] = dateRange
  const [p0, p1] = priceRange
  const pts = data.map((d) => {
    const x = ((new Date(d.date).getTime() - d0) / (d1 - d0)) * w
    const y = h - ((d.price - p0) / (p1 - p0)) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return 'M ' + pts.join(' L ')
}

function buildAreaPath(
  data: Array<{ date: string; price: number }>,
  dateRange: [number, number],
  priceRange: [number, number],
  w: number,
  h: number,
): string {
  const line = buildPath(data, dateRange, priceRange, w, h)
  if (!line) return ''
  const lastX = ((new Date(data[data.length - 1].date).getTime() - dateRange[0]) / (dateRange[1] - dateRange[0])) * w
  const firstX = ((new Date(data[0].date).getTime() - dateRange[0]) / (dateRange[1] - dateRange[0])) * w
  return `${line} L ${lastX.toFixed(1)},${h} L ${firstX.toFixed(1)},${h} Z`
}

function monthTicks(dateRange: [number, number], w: number): Array<{ x: number; label: string }> {
  const [d0, d1] = dateRange
  const ticks: Array<{ x: number; label: string }> = []
  const start = new Date(d0)
  start.setDate(1)
  start.setMonth(start.getMonth() + 1)
  while (start.getTime() <= d1) {
    const x = ((start.getTime() - d0) / (d1 - d0)) * w
    ticks.push({ x, label: `${start.getMonth() + 1}月` })
    start.setMonth(start.getMonth() + 1)
  }
  return ticks
}

export default function TomatoCharts({ series, locale }: Props) {
  const ui = UI[locale]
  const [active, setActive] = useState<Set<string>>(() => new Set(series.map((s) => s.id)))
  const [period, setPeriod] = useState<'1M' | '3M'>('3M')

  const cutoffDays = period === '1M' ? 30 : 90
  const cutoff = Date.now() - cutoffDays * 86400000

  const filteredSeries = useMemo(
    () =>
      series
        .filter((s) => active.has(s.id))
        .map((s) => ({ ...s, data: s.data.filter((d) => new Date(d.date).getTime() >= cutoff) }))
        .filter((s) => s.data.length >= 2),
    [series, active, cutoff],
  )

  const allDates = filteredSeries.flatMap((s) => s.data.map((d) => new Date(d.date).getTime()))
  const allPrices = filteredSeries.flatMap((s) => s.data.map((d) => d.price))
  const dateRange: [number, number] = allDates.length
    ? [Math.min(...allDates), Math.max(...allDates)]
    : [cutoff, Date.now()]
  const priceRange: [number, number] = allPrices.length
    ? [Math.max(0, Math.min(...allPrices) - 10), Math.max(...allPrices) + 10]
    : [0, 100]

  const W = 760
  const H = 180
  const ticks = monthTicks(dateRange, W)

  // Price gridlines
  const pStep = Math.ceil((priceRange[1] - priceRange[0]) / 4 / 10) * 10
  const gridPrices: number[] = []
  let gp = Math.ceil(priceRange[0] / pStep) * pStep
  while (gp <= priceRange[1]) { gridPrices.push(gp); gp += pStep }

  function toggleSeries(id: string) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { if (next.size > 1) next.delete(id) } else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Period + legend */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-1">
          {(['1M', '3M'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${period === p ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              {p === '1M' ? ui.period1M : ui.period3M}
            </button>
          ))}
        </div>
        {/* Variety toggle chips */}
        <div className="flex flex-wrap gap-1.5">
          {series.map((s) => {
            const isOn = active.has(s.id)
            const name = locale === 'ja' ? s.nameJa : locale === 'ne' ? s.nameNe : s.nameEn
            return (
              <button
                key={s.id}
                onClick={() => toggleSeries(s.id)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-all ${
                  isOn ? 'opacity-100' : 'opacity-35'
                }`}
                style={isOn ? { borderColor: s.color, color: s.color, backgroundColor: s.color + '22' } : { borderColor: '#52525b', color: '#71717a' }}
              >
                <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: isOn ? s.color : '#52525b' }} />
                🍅 {name}
              </button>
            )
          })}
        </div>
      </div>

      {/* SVG chart */}
      <div className="rounded-xl border border-red-900/30 bg-zinc-900/60 p-3 overflow-x-auto">
        <svg viewBox={`-40 -10 ${W + 50} ${H + 40}`} className="w-full" style={{ minWidth: 320 }}>
          {/* Gridlines */}
          {gridPrices.map((p) => {
            const y = H - ((p - priceRange[0]) / (priceRange[1] - priceRange[0])) * H
            return (
              <g key={p}>
                <line x1={0} y1={y} x2={W} y2={y} stroke="#3f3f46" strokeWidth="0.5" />
                <text x={-6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#71717a">
                  {p}
                </text>
              </g>
            )
          })}
          {/* Month ticks */}
          {ticks.map((t) => (
            <g key={t.x}>
              <line x1={t.x} y1={0} x2={t.x} y2={H} stroke="#27272a" strokeWidth="0.5" />
              <text x={t.x} y={H + 12} textAnchor="middle" fontSize={9} fill="#71717a">
                {t.label}
              </text>
            </g>
          ))}
          {/* Series areas (fill) */}
          {filteredSeries.map((s) => (
            <path
              key={s.id + '-area'}
              d={buildAreaPath(s.data, dateRange, priceRange, W, H)}
              fill={s.color}
              opacity={0.07}
            />
          ))}
          {/* Series lines */}
          {filteredSeries.map((s) => (
            <path
              key={s.id + '-line'}
              d={buildPath(s.data, dateRange, priceRange, W, H)}
              stroke={s.color}
              strokeWidth="2"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {/* End-point labels */}
          {filteredSeries.map((s) => {
            const last = s.data[s.data.length - 1]
            const x = ((new Date(last.date).getTime() - dateRange[0]) / (dateRange[1] - dateRange[0])) * W
            const y = H - ((last.price - priceRange[0]) / (priceRange[1] - priceRange[0])) * H
            return (
              <g key={s.id + '-end'}>
                <circle cx={x} cy={y} r={3} fill={s.color} />
                <text x={x + 5} y={y + 1} fontSize={8} fill={s.color} dominantBaseline="middle" fontWeight="600">
                  {last.price.toFixed(0)}
                </text>
              </g>
            )
          })}
          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={H} stroke="#52525b" strokeWidth="0.5" />
          <line x1={0} y1={H} x2={W} y2={H} stroke="#52525b" strokeWidth="0.5" />
        </svg>
        {filteredSeries.length === 0 && (
          <p className="text-center text-sm text-zinc-500 py-6">{ui.noData}</p>
        )}
      </div>
    </div>
  )
}
