'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Locale } from '@/types'

export type MarketMapData = {
  id: string
  nameEn: string
  nameNe: string
  source: string
  isStale: boolean
  latestDate: string | null
  priceIndex: number | null   // 100 = cross-market average; >100 = more expensive
  avgPrice: number | null     // NPR per unit, raw average over last 7d
  vegCount: number
}

interface Props {
  markets: MarketMapData[]
  selectedMarketId?: string
  locale: Locale
}

// Simplified Nepal outline
// viewBox "0 0 824 420"
// Coordinate conversion: x = (lon_E − 80.0)×100, y = (30.5 − lat_N)×100
const NEPAL_PATH =
  'M6,87 L9,12 L88,8 L162,20 L220,28 L300,55 L345,55 ' +
  'L401,30 L462,40 L520,70 L588,60 L640,75 L655,190 ' +
  'L708,240 L780,260 L818,280 L818,373 ' +
  'L762,403 L653,398 L520,398 L455,388 ' +
  'L338,308 L270,300 L192,298 L142,265 L77,212 L34,175 Z'

// Each market's SVG dot position + label anchor
// x = (lon − 80)×100, y = (30.5 − lat)×100
type PinSpec = { x: number; y: number; lx: number; ly: number; anchor: 'start' | 'end' | 'middle' }
const PINS: Record<string, PinSpec> = {
  Attaria:       { x: 53,  y: 173, lx: 43,  ly: 161, anchor: 'end' },
  Birendranagar: { x: 163, y: 189, lx: 173, ly: 179, anchor: 'start' },
  Kohalpur:      { x: 167, y: 232, lx: 177, ly: 244, anchor: 'start' },
  Butwal:        { x: 344, y: 278, lx: 334, ly: 268, anchor: 'end' },
  Kawasoti:      { x: 400, y: 284, lx: 410, ly: 295, anchor: 'start' },
  Pokhara:       { x: 399, y: 229, lx: 399, ly: 217, anchor: 'middle' },
  Kalimati:      { x: 532, y: 280, lx: 543, ly: 270, anchor: 'start' },
  Lalbandi:      { x: 522, y: 335, lx: 512, ly: 347, anchor: 'end' },
  Dhalkewar:     { x: 572, y: 317, lx: 562, ly: 307, anchor: 'end' },
  Kamalmai:      { x: 597, y: 327, lx: 608, ly: 338, anchor: 'start' },
  Dharan:        { x: 728, y: 369, lx: 728, ly: 358, anchor: 'middle' },
  Birtamod:      { x: 799, y: 385, lx: 789, ly: 374, anchor: 'end' },
}

const SHORT_LABELS: Record<string, string> = {
  Birendranagar: 'Biren.',
  Kawasoti: 'Kawas.',
  Kamalmai: 'Kamal.',
  Dhalkewar: 'Dhalk.',
}

// Diverging scale: blue (cheap) → zinc neutral → orange/red (expensive)
// Validated: all hues are distinguishable in deuteranopia/protanopia; orange-blue is CVD-safe.
// Secondary encoding (index number in tooltip + bar chart) covers tritanopia edge case.
function indexColor(idx: number | null, stale: boolean): string {
  if (stale || idx === null) return '#52525b'  // zinc-600 — no data, intentionally dim
  if (idx < 85)  return '#2563eb'             // blue-600  very cheap
  if (idx < 95)  return '#60a5fa'             // blue-400  below average
  if (idx < 105) return '#a1a1aa'             // zinc-400  near average
  if (idx < 115) return '#fb923c'             // orange-400 above average
  return '#ef4444'                             // red-500   expensive
}

const UI = {
  en: {
    title: 'Market Map',
    rankTitle: 'Price Index by Market',
    avg: 'avg',
    cheap: 'Cheaper',
    expensive: 'Pricier',
    unavailable: 'Unavailable',
    lastUpdate: 'Updated',
    index: 'Index',
    vegCount: 'items',
    allMarkets: 'All Markets',
    note: 'Index 100 = cross-market avg (last 7 days)',
  },
  ne: {
    title: 'बजार नक्सा',
    rankTitle: 'बजार अनुसार मूल्य सूचकांक',
    avg: 'औसत',
    cheap: 'सस्तो',
    expensive: 'महँगो',
    unavailable: 'डेटा उपलब्ध छैन',
    lastUpdate: 'अद्यावधिक',
    index: 'सूचकांक',
    vegCount: 'वस्तुहरू',
    allMarkets: 'सबै बजार',
    note: 'सूचकांक १०० = बजार औसत (अन्तिम ७ दिन)',
  },
  ja: {
    title: '市場マップ',
    rankTitle: '市場別価格指数',
    avg: '平均',
    cheap: '安価',
    expensive: '高価',
    unavailable: 'データ停止中',
    lastUpdate: '更新',
    index: '指数',
    vegCount: '品目',
    allMarkets: '全市場',
    note: '指数100 = 市場平均（直近7日）',
  },
} as const

export default function NepalMarketMap({ markets, selectedMarketId, locale }: Props) {
  const router = useRouter()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const ui = UI[locale]

  const hoveredMarket = hoveredId ? markets.find(m => m.id === hoveredId) : null

  // Sort by priceIndex ascending (cheapest first) for bar chart
  const ranked = [...markets]
    .filter(m => !m.isStale && m.priceIndex !== null)
    .sort((a, b) => (a.priceIndex ?? 0) - (b.priceIndex ?? 0))

  const maxIndex = ranked.length > 0
    ? Math.max(...ranked.map(m => m.priceIndex!), 120)
    : 130

  function navigate(m: MarketMapData) {
    const href = m.id === selectedMarketId ? `/${locale}` : `/${locale}?marketId=${m.id}`
    router.push(href)
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{ui.title}</h2>
        {selectedMarketId && (
          <button
            onClick={() => router.push(`/${locale}`)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← {ui.allMarkets}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] divide-y md:divide-y-0 md:divide-x divide-zinc-800">

        {/* ─── Left panel: SVG map ─── */}
        <div className="relative p-3">
          <svg viewBox="0 0 824 420" className="w-full" style={{ maxHeight: 260 }}>
            {/* Nepal fill */}
            <path
              d={NEPAL_PATH}
              fill="#1c1917"
              stroke="#44403c"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Himalayan ridge silhouette (decorative, non-data) */}
            <path
              d="M15,140 L38,118 L58,132 L82,108 L112,122 L148,98 L178,112 L218,94 L252,108 L285,84 L316,98 L348,87 L382,74 L415,64 L452,74 L490,86 L528,104 L562,96 L598,110 L628,104"
              fill="none"
              stroke="#3f3f46"
              strokeWidth="1"
              strokeLinejoin="round"
              opacity="0.4"
            />

            {/* Market pins */}
            {markets.map(m => {
              const pin = PINS[m.nameEn]
              if (!pin) return null

              const isSelected = m.id === selectedMarketId
              const isHovered = m.id === hoveredId
              const color = indexColor(m.priceIndex, m.isStale)
              const r = isSelected ? 11 : isHovered ? 10 : 8
              const label = locale === 'ne'
                ? m.nameNe
                : (SHORT_LABELS[m.nameEn] ?? m.nameEn)

              return (
                <g
                  key={m.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(m)}
                  onMouseEnter={() => setHoveredId(m.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Selection halo */}
                  {isSelected && (
                    <circle cx={pin.x} cy={pin.y} r={18}
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                      opacity={0.4}
                    />
                  )}
                  {/* Dot — 2px surface ring so overlapping marks stay distinct */}
                  <circle
                    cx={pin.x} cy={pin.y} r={r}
                    fill={color}
                    stroke="#18181b"
                    strokeWidth="1.5"
                    opacity={m.isStale ? 0.45 : 0.92}
                  />
                  {/* Stale amber badge */}
                  {m.isStale && (
                    <circle
                      cx={pin.x + r - 1} cy={pin.y - r + 1} r={3}
                      fill="#fbbf24"
                      stroke="#18181b"
                      strokeWidth="1"
                    />
                  )}
                  {/* Index value inside dot when selected/hovered */}
                  {(isSelected || isHovered) && m.priceIndex !== null && (
                    <text
                      x={pin.x} y={pin.y + 1}
                      fontSize={7} textAnchor="middle" dominantBaseline="middle"
                      fill="#fff" fontWeight="700"
                      style={{ pointerEvents: 'none' }}
                    >
                      {Math.round(m.priceIndex)}
                    </text>
                  )}
                  {/* Market name label */}
                  <text
                    x={pin.lx} y={pin.ly}
                    fontSize={9}
                    textAnchor={pin.anchor}
                    dominantBaseline="middle"
                    fill={isSelected || isHovered ? '#e4e4e7' : '#71717a'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {label}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Hover tooltip */}
          {hoveredMarket && (
            <div className="absolute top-3 right-3 rounded-md border border-zinc-700 bg-zinc-800/95 px-3 py-2.5 text-xs pointer-events-none z-10 min-w-[160px] shadow-xl">
              <p className="font-semibold text-zinc-100 mb-1.5">
                {locale === 'ne' ? hoveredMarket.nameNe : hoveredMarket.nameEn}
              </p>
              {hoveredMarket.priceIndex !== null ? (
                <div className="space-y-0.5">
                  <p>
                    <span className="text-zinc-400">{ui.index}: </span>
                    <span
                      className="font-mono font-bold"
                      style={{ color: indexColor(hoveredMarket.priceIndex, false) }}
                    >
                      {Math.round(hoveredMarket.priceIndex)}
                    </span>
                    <span className="text-zinc-600"> /100</span>
                  </p>
                  {hoveredMarket.avgPrice !== null && (
                    <p>
                      <span className="text-zinc-400">{ui.avg}: </span>
                      <span className="font-mono text-zinc-300">NPR {hoveredMarket.avgPrice.toFixed(0)}</span>
                    </p>
                  )}
                  {hoveredMarket.vegCount > 0 && (
                    <p className="text-zinc-500">{hoveredMarket.vegCount} {ui.vegCount}</p>
                  )}
                </div>
              ) : (
                <p className="text-zinc-500">{ui.unavailable}</p>
              )}
              {hoveredMarket.latestDate && (
                <p className="text-zinc-600 mt-1.5 pt-1.5 border-t border-zinc-700">
                  {ui.lastUpdate}: {hoveredMarket.latestDate}
                </p>
              )}
              {hoveredMarket.isStale && (
                <p className="text-amber-400 mt-1">⚠ {ui.unavailable}</p>
              )}
            </div>
          )}

          {/* Color legend */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 px-1 text-[10px] text-zinc-500">
            <span className="font-medium text-zinc-400">{ui.index}:</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600" />
              {ui.cheap}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-zinc-400" />
              100
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              {ui.expensive}
            </span>
            <span className="flex items-center gap-1 ml-1">
              <span className="inline-block w-2 h-2 rounded-full bg-zinc-600 opacity-50" />
              {ui.unavailable}
            </span>
          </div>
        </div>

        {/* ─── Right panel: price index bar chart ─── */}
        {ranked.length > 0 && (
          <div className="p-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              {ui.rankTitle}
            </p>

            <div className="space-y-2.5">
              {ranked.map(m => {
                const idx = m.priceIndex!
                const barPct = (idx / maxIndex) * 100
                const refPct = (100 / maxIndex) * 100
                const color = indexColor(idx, false)
                const isSelected = m.id === selectedMarketId
                const mName = locale === 'ne' ? m.nameNe : m.nameEn
                const displayName = mName.length > 14 ? mName.slice(0, 13) + '…' : mName

                return (
                  <button
                    key={m.id}
                    onClick={() => navigate(m)}
                    className={`w-full text-left group rounded transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 ${
                      isSelected ? 'ring-1 ring-zinc-500 bg-zinc-800/40' : ''
                    }`}
                  >
                    {/* Label row */}
                    <div className="flex items-baseline justify-between mb-1 px-1">
                      <span className={`text-xs truncate transition-colors ${
                        isSelected ? 'text-zinc-100 font-medium' : 'text-zinc-300 group-hover:text-zinc-100'
                      }`}>
                        {displayName}
                      </span>
                      <span
                        className="text-xs font-mono font-semibold ml-2 shrink-0"
                        style={{ color }}
                      >
                        {Math.round(idx)}
                      </span>
                    </div>
                    {/* Bar track */}
                    <div className="relative h-3 rounded overflow-hidden bg-zinc-800">
                      {/* Filled bar */}
                      <div
                        className="h-full rounded transition-all duration-300"
                        style={{
                          width: `${barPct.toFixed(1)}%`,
                          backgroundColor: color,
                          opacity: isSelected ? 1 : 0.7,
                        }}
                      />
                      {/* Reference line at index=100 */}
                      <div
                        className="absolute inset-y-0 w-px bg-zinc-500"
                        style={{ left: `${refPct.toFixed(1)}%` }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Scale note */}
            <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed">
              | = {ui.avg} (100). {ui.note}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
