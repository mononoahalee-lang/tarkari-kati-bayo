'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { CandlestickPoint, Locale } from '@/types'

const PriceChart = dynamic(() => import('./PriceChart'), { ssr: false })

type VegItem = {
  id: string
  nameNe: string
  nameEn: string
  nameJa: string
  unit: string
  avgPrice: number | null
  changePct: number | null
  min52w: number | null
  max52w: number | null
}

function PriceGauge({
  current, min, max, size = 'sm',
}: {
  current: number; min: number | null; max: number | null; size?: 'sm' | 'lg'
}) {
  if (min === null || max === null || min >= max) return null
  const pct = Math.max(2, Math.min(98, ((current - min) / (max - min)) * 100))
  const color = pct < 30 ? 'bg-green-500' : pct > 70 ? 'bg-red-400' : 'bg-yellow-500'
  if (size === 'lg') {
    return (
      <div className="w-full">
        <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
          <span>{min.toFixed(0)}</span>
          <span className="text-zinc-400">52W Range</span>
          <span>{max.toFixed(0)}</span>
        </div>
        <div className="relative h-1.5 rounded-full bg-zinc-700">
          <div className={`h-full rounded-full ${color} opacity-80`} style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border border-zinc-900 shadow"
            style={{ left: `${pct}%`, transform: 'translateX(-50%) translateY(-50%)' }}
          />
        </div>
      </div>
    )
  }
  return (
    <div className="w-full h-0.5 rounded-full bg-zinc-700 mt-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

type MarketItem = {
  id: string
  nameEn: string
  nameNe: string
}

type Period = '1W' | '1M' | '3M' | '1Y'
const PERIOD_DAYS: Record<Period, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }
const PERIOD_LABELS: Record<Period, Record<Locale, string>> = {
  '1W': { ne: 'साप्ताहिक', en: 'Weekly', ja: '週次' },
  '1M': { ne: 'मासिक', en: 'Monthly', ja: '月次' },
  '3M': { ne: '३ महिना', en: '3M', ja: '3ヶ月' },
  '1Y': { ne: '१ वर्ष', en: '1Y', ja: '1年' },
}

const UI: Record<Locale, {
  search: string; select: string; noData: string; high: string; low: string; avg: string
  loading: string; noPriceHistory: string; allMarkets: string; market: string
  avgPrice: string; allMarketsAvg: string; marketCompare: string; min: string; max: string
}> = {
  ne: {
    search: 'तरकारी खोज्नुहोस्...', select: 'तरकारी चुन्नुहोस्', noData: 'डेटा उपलब्ध छैन',
    high: 'उच्च', low: 'न्यून', avg: 'औसत', loading: 'लोड हुँदैछ...', noPriceHistory: 'मूल्य इतिहास उपलब्ध छैन',
    allMarkets: 'सबै बजार', market: 'बजार',
    avgPrice: 'औसत थोक मूल्य', allMarketsAvg: 'सबै बजारको औसत', marketCompare: 'बजारअनुसार मूल्य',
    min: 'न्यून', max: 'उच्च',
  },
  en: {
    search: 'Search vegetables...', select: 'Select a vegetable', noData: 'No data',
    high: 'High', low: 'Low', avg: 'Avg', loading: 'Loading...', noPriceHistory: 'No price history yet. Data is collected daily.',
    allMarkets: 'All Markets', market: 'Market',
    avgPrice: 'Avg. Wholesale Price', allMarketsAvg: 'All markets average', marketCompare: 'Price by Market',
    min: 'Min', max: 'Max',
  },
  ja: {
    search: '野菜を検索...', select: '野菜を選択', noData: 'データなし',
    high: '最高値', low: '最安値', avg: '平均', loading: '読み込み中...', noPriceHistory: '価格履歴がありません（毎日更新）',
    allMarkets: '全市場', market: '市場',
    avgPrice: '平均卸売価格', allMarketsAvg: '全市場の平均', marketCompare: '市場別価格',
    min: '最低値', max: '最高値',
  },
}

function getName(v: VegItem, locale: Locale) {
  return locale === 'ne' ? v.nameNe : locale === 'ja' ? v.nameJa : v.nameEn
}

interface Props {
  vegetables: VegItem[]
  markets: MarketItem[]
  locale: Locale
}

export default function ChartExplorer({ vegetables, markets, locale }: Props) {
  const ui = UI[locale]
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(vegetables[0]?.id ?? null)
  const [selectedMarketId, setSelectedMarketId] = useState<string>('all')
  const [period, setPeriod] = useState<Period>('1Y')
  const [candlesticks, setCandlesticks] = useState<CandlestickPoint[]>([])
  const [stats, setStats] = useState<{ high: number; low: number; avg: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [marketPrices, setMarketPrices] = useState<Array<{
    marketId: string; marketNameEn: string; marketNameNe: string
    district: string; minPrice: number; maxPrice: number; avgPrice: number; date: string
  }>>([])
  const [loadingMarkets, setLoadingMarkets] = useState(false)
  const [mobileListOpen, setMobileListOpen] = useState(false)
  const [marketVegIds, setMarketVegIds] = useState<Set<string> | null>(null)
  const [marketPriceMap, setMarketPriceMap] = useState<Record<string, { avgPrice: number; changePct: number | null; min52w: number | null; max52w: number | null }> | null>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return vegetables.filter(
      (v) =>
        (marketVegIds === null || marketVegIds.has(v.id)) &&
        (v.nameNe.toLowerCase().includes(q) ||
          v.nameEn.toLowerCase().includes(q) ||
          v.nameJa.toLowerCase().includes(q))
    )
  }, [vegetables, query, marketVegIds])

  const selected = useMemo(() => vegetables.find((v) => v.id === selectedId) ?? null, [vegetables, selectedId])

  const fetchChart = useCallback(async (id: string, marketId: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ days: '1095' })
      if (marketId !== 'all') params.set('marketId', marketId)
      const res = await fetch(`/api/vegetables/${id}/history?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setCandlesticks(data.candlesticks ?? [])
      setStats(data.stats ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) fetchChart(selectedId, selectedMarketId)
  }, [selectedId, selectedMarketId, fetchChart])

  // Fetch vegetable IDs available in the selected market
  useEffect(() => {
    if (selectedMarketId === 'all') {
      setMarketVegIds(null)
      setMarketPriceMap(null)
      return
    }
    fetch(`/api/markets/${selectedMarketId}/vegetables`)
      .then((r) => r.json())
      .then((data) => {
        const priceMap: Record<string, { avgPrice: number; changePct: number | null; min52w: number | null; max52w: number | null }> = data.prices ?? {}
        // Only show vegetables that have data on the latest date for this market
        const idsWithData = new Set<string>(Object.keys(priceMap))
        setMarketVegIds(idsWithData)
        setMarketPriceMap(priceMap)
        // If the currently selected vegetable has no data in this market, pick the first available
        if (selectedId && !idsWithData.has(selectedId)) {
          const first = vegetables.find((v) => idsWithData.has(v.id))
          setSelectedId(first?.id ?? null)
        }
      })
      .catch(() => { setMarketVegIds(null); setMarketPriceMap(null) })
  }, [selectedMarketId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) return
    setLoadingMarkets(true)
    fetch(`/api/vegetables/${selectedId}/market-compare`)
      .then((r) => r.json())
      .then((data) => setMarketPrices(data ?? []))
      .catch(() => setMarketPrices([]))
      .finally(() => setLoadingMarkets(false))
  }, [selectedId])

  const changePct = selected?.changePct

  // Compute stats for the currently visible period (relative to last data point)
  const periodStats = useMemo(() => {
    if (candlesticks.length === 0) return null
    const lastDate = new Date(candlesticks[candlesticks.length - 1].time as string + 'T00:00:00Z')
    const cutoff = new Date(lastDate)
    cutoff.setDate(cutoff.getDate() - PERIOD_DAYS[period])
    const cutoffStr = cutoff.toISOString().split('T')[0]
    const visible = candlesticks.filter((c) => (c.time as string) >= cutoffStr)
    const source = visible.length >= 2 ? visible : candlesticks
    const highs = source.map((c) => c.high)
    const lows = source.map((c) => c.low)
    const avgs = source.map((c) => c.close)
    return {
      high: Math.max(...highs),
      low: Math.min(...lows),
      avg: avgs.reduce((a, b) => a + b, 0) / avgs.length,
    }
  }, [candlesticks, period])

  // When a specific market is selected, show that market's price instead of all-markets average
  const selectedMarketPrice = selectedMarketId !== 'all'
    ? marketPrices.find((mp) => mp.marketId === selectedMarketId) ?? null
    : null

  const displayPrice = selectedMarketPrice?.avgPrice ?? selected?.avgPrice ?? null
  const displayPriceLabel = selectedMarketPrice
    ? (locale === 'ne' ? selectedMarketPrice.marketNameNe : selectedMarketPrice.marketNameEn)
    : ui.allMarketsAvg
  const displaySubLabel = selectedMarketPrice ? ui.avgPrice : `${ui.avgPrice} · ${ui.allMarketsAvg}`

  const marketLabel = selectedMarketId === 'all'
    ? ui.allMarkets
    : (markets.find((m) => m.id === selectedMarketId)?.nameEn ?? ui.allMarkets)

  // Shared vegetable list content
  const vegListContent = (
    <>
      <div className="p-3 border-b border-zinc-700">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ui.search}
          className="w-full rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 outline-none focus:ring-1 focus:ring-green-500"
        />
        <p className="mt-1.5 text-xs text-zinc-400">{filtered.length} items</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((v) => {
          const isSelected = v.id === selectedId
          const mktData = marketPriceMap?.[v.id]
          const displayAvg = mktData?.avgPrice ?? v.avgPrice
          const pct = mktData?.changePct ?? v.changePct
          const min52w = mktData?.min52w ?? v.min52w
          const max52w = mktData?.max52w ?? v.max52w
          return (
            <button
              key={v.id}
              onClick={() => { setSelectedId(v.id); setMobileListOpen(false) }}
              className={`w-full px-3 py-2.5 text-left text-sm transition-colors border-b border-zinc-800 ${
                isSelected
                  ? 'bg-green-900/40 border-l-2 border-l-green-400'
                  : 'hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`truncate font-medium ${isSelected ? 'text-white' : 'text-zinc-100'}`}>
                  {getName(v, locale)}
                </span>
                <div className="flex flex-col items-end ml-2 shrink-0">
                  {displayAvg !== null && displayAvg !== undefined && (
                    <span className="font-mono text-sm font-semibold text-white">{displayAvg.toFixed(0)}</span>
                  )}
                  {pct !== null && pct !== undefined && (
                    <span className={`font-mono text-xs font-medium ${pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              {displayAvg !== null && displayAvg !== undefined && (
                <PriceGauge current={displayAvg} min={min52w} max={max52w} size="sm" />
              )}
            </button>
          )
        })}
      </div>
    </>
  )

  return (
    <div className="flex flex-col lg:flex-row gap-0 lg:h-[calc(100vh-8rem)]">
      {/* Mobile: drawer overlay */}
      {mobileListOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileListOpen(false)} />
          <div className="relative z-10 flex flex-col w-80 max-w-[85vw] bg-zinc-900 border-r border-zinc-700 h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
              <span className="text-sm font-semibold text-zinc-200">{ui.search}</span>
              <button onClick={() => setMobileListOpen(false)} className="text-zinc-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            {vegListContent}
          </div>
        </div>
      )}

      {/* Desktop: left sidebar */}
      <div className="hidden lg:flex lg:w-72 xl:w-80 flex-col border-r border-zinc-700 overflow-hidden bg-zinc-900">
        {vegListContent}
      </div>

      {/* Right: chart panel — mobile scrolls freely; desktop is fixed-height flex */}
      <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden p-3 sm:p-4 gap-3 lg:min-h-0">
        {/* Mobile: select vegetable button */}
        <div className="lg:hidden shrink-0">
          <button
            onClick={() => setMobileListOpen(true)}
            className="w-full flex items-center justify-between rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm"
          >
            <span className="text-zinc-100 font-medium truncate">
              {selected ? getName(selected, locale) : ui.select}
            </span>
            <span className="text-zinc-400 ml-2 shrink-0">▼ {filtered.length} items</span>
          </button>
        </div>

        {selected ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-2 sm:gap-4 shrink-0">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{getName(selected, locale)}</h1>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  {locale === 'ne' ? selected.nameEn : selected.nameNe} · NPR/{selected.unit}
                </p>
              </div>
              <div className="text-right shrink-0">
                {displayPrice !== null && (
                  <>
                    <p className="text-2xl sm:text-3xl font-bold font-mono text-white">
                      {displayPrice.toFixed(2)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">{displaySubLabel}</p>
                    {selectedMarketPrice && (
                      <p className="text-xs text-green-400 font-medium mt-0.5">{displayPriceLabel}</p>
                    )}
                  </>
                )}
                {changePct !== null && changePct !== undefined && (
                  <p className={`text-base font-mono font-bold mt-1 ${changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {changePct >= 0 ? '▲ +' : '▼ '}{changePct.toFixed(2)}%
                  </p>
                )}
              </div>
            </div>
            {/* 52-week price range gauge */}
            {(() => {
              const min52w = marketPriceMap?.[selected.id]?.min52w ?? selected.min52w
              const max52w = marketPriceMap?.[selected.id]?.max52w ?? selected.max52w
              return displayPrice !== null && min52w !== null && max52w !== null ? (
                <div className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
                  <PriceGauge current={displayPrice} min={min52w} max={max52w} size="lg" />
                </div>
              ) : null
            })()}

            {/* Controls: period + market */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
              <div className="flex gap-1">
                {(Object.keys(PERIOD_DAYS) as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded px-2.5 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                      p === period
                        ? 'bg-green-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    {PERIOD_LABELS[p][locale]}
                  </button>
                ))}
              </div>
              <div className="ml-auto">
                <select
                  value={selectedMarketId}
                  onChange={(e) => setSelectedMarketId(e.target.value)}
                  className="rounded-md bg-zinc-800 border border-zinc-600 px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-zinc-100 font-medium outline-none focus:ring-1 focus:ring-green-500 cursor-pointer max-w-[140px] sm:max-w-none"
                >
                  <option value="all">{ui.allMarkets}</option>
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {locale === 'ne' ? m.nameNe : m.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chart */}
            <div className="h-[280px] lg:flex-1 lg:h-auto lg:min-h-0 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
              {loading ? (
                <div className="flex h-full items-center justify-center text-zinc-400 text-sm">{ui.loading}</div>
              ) : candlesticks.length > 0 ? (
                <PriceChart data={candlesticks} visibleDays={PERIOD_DAYS[period]} height={undefined} className="h-full" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400 text-sm text-center px-8">
                  <span className="text-4xl">📊</span>
                  <p className="text-base font-medium text-zinc-300">{ui.noPriceHistory}</p>
                  {selectedMarketId !== 'all' && (
                    <button
                      onClick={() => setSelectedMarketId('all')}
                      className="mt-1 rounded-md bg-zinc-700 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-600 transition-colors"
                    >
                      → {ui.allMarkets}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            {(periodStats ?? stats) && (
              <div className="grid grid-cols-3 gap-3 shrink-0">
                {[
                  { label: ui.high, value: (periodStats ?? stats)!.high.toFixed(2), color: 'text-green-400' },
                  { label: ui.avg, value: (periodStats ?? stats)!.avg.toFixed(2), color: 'text-white' },
                  { label: ui.low, value: (periodStats ?? stats)!.low.toFixed(2), color: 'text-red-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-center">
                    <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</p>
                    <p className={`mt-1 font-mono text-lg font-bold ${color}`}>{value}</p>
                    {label === ui.avg && (
                      <p className="text-xs text-zinc-500 mt-0.5">{marketLabel}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Market comparison table */}
            <div className="hidden lg:block shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden">
              <div className="px-3 py-2 border-b border-zinc-700 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{ui.marketCompare}</h3>
                {marketPrices.length > 0 && (
                  <span className="text-xs text-zinc-500">{marketPrices[0]?.date}</span>
                )}
              </div>
              {loadingMarkets ? (
                <div className="p-3 text-xs text-zinc-500">{ui.loading}</div>
              ) : marketPrices.length === 0 ? (
                <div className="p-3 text-xs text-zinc-500">{ui.noData}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                        <th className="px-3 py-1.5 text-left">{ui.market}</th>
                        <th className="px-3 py-1.5 text-right">{ui.min}</th>
                        <th className="px-3 py-1.5 text-right font-bold text-zinc-300">{ui.avg}</th>
                        <th className="px-3 py-1.5 text-right">{ui.max}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketPrices
                        .sort((a, b) => (a.avgPrice ?? 0) - (b.avgPrice ?? 0))
                        .map((mp) => (
                          <tr
                            key={mp.marketId}
                            className={`border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors ${
                              mp.marketId === selectedMarketId ? 'bg-green-900/20' : ''
                            }`}
                          >
                            <td className="px-3 py-1.5">
                              <button
                                onClick={() => setSelectedMarketId(mp.marketId)}
                                className="text-left hover:text-green-400 transition-colors"
                              >
                                <span className="font-medium text-zinc-200">
                                  {locale === 'ne' ? mp.marketNameNe : mp.marketNameEn}
                                </span>
                                <span className="ml-1 text-zinc-500">{mp.district}</span>
                              </button>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{mp.minPrice.toFixed(0)}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold text-white">{mp.avgPrice.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{mp.maxPrice.toFixed(0)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-400 text-base">{ui.select}</div>
        )}
      </div>
    </div>
  )
}
