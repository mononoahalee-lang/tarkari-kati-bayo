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
}

type MarketItem = {
  id: string
  nameEn: string
  nameNe: string
}

type Period = '1W' | '1M' | '3M' | '1Y' | '3Y'
const PERIOD_DAYS: Record<Period, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '3Y': 1095 }
const PERIOD_LABELS: Record<Period, Record<Locale, string>> = {
  '1W': { ne: '१ हप्ता', en: '1W', ja: '1週' },
  '1M': { ne: '१ महिना', en: '1M', ja: '1ヶ月' },
  '3M': { ne: '३ महिना', en: '3M', ja: '3ヶ月' },
  '1Y': { ne: '१ वर्ष', en: '1Y', ja: '1年' },
  '3Y': { ne: '३ वर्ष', en: '3Y', ja: '3年' },
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
  const [period, setPeriod] = useState<Period>('1M')
  const [candlesticks, setCandlesticks] = useState<CandlestickPoint[]>([])
  const [stats, setStats] = useState<{ high: number; low: number; avg: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [marketPrices, setMarketPrices] = useState<Array<{
    marketId: string; marketNameEn: string; marketNameNe: string
    district: string; minPrice: number; maxPrice: number; avgPrice: number; date: string
  }>>([])
  const [loadingMarkets, setLoadingMarkets] = useState(false)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return vegetables.filter(
      (v) =>
        v.nameNe.toLowerCase().includes(q) ||
        v.nameEn.toLowerCase().includes(q) ||
        v.nameJa.toLowerCase().includes(q)
    )
  }, [vegetables, query])

  const selected = useMemo(() => vegetables.find((v) => v.id === selectedId) ?? null, [vegetables, selectedId])

  const fetchChart = useCallback(async (id: string, p: Period, marketId: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ days: String(PERIOD_DAYS[p]) })
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
    if (selectedId) fetchChart(selectedId, period, selectedMarketId)
  }, [selectedId, period, selectedMarketId, fetchChart])

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
  const marketLabel = selectedMarketId === 'all'
    ? ui.allMarkets
    : (markets.find((m) => m.id === selectedMarketId)?.nameEn ?? ui.allMarkets)

  return (
    <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-8rem)]">
      {/* Left: vegetable list */}
      <div className="lg:w-72 xl:w-80 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-700 overflow-hidden bg-zinc-900">
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
            const pct = v.changePct
            return (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-sm transition-colors border-b border-zinc-800 ${
                  isSelected
                    ? 'bg-green-900/40 border-l-2 border-l-green-400'
                    : 'hover:bg-zinc-800'
                }`}
              >
                <span className={`truncate font-medium ${isSelected ? 'text-white' : 'text-zinc-100'}`}>
                  {getName(v, locale)}
                </span>
                <div className="flex flex-col items-end ml-2 shrink-0">
                  {v.avgPrice !== null && (
                    <span className="font-mono text-sm font-semibold text-white">{v.avgPrice.toFixed(0)}</span>
                  )}
                  {pct !== null && (
                    <span className={`font-mono text-xs font-medium ${pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: chart panel */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3 min-h-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 shrink-0">
              <div>
                <h1 className="text-2xl font-bold text-white">{getName(selected, locale)}</h1>
                <p className="text-sm text-zinc-400 mt-0.5">
                  {locale === 'ne' ? selected.nameEn : selected.nameNe} · NPR/{selected.unit}
                </p>
              </div>
              <div className="text-right shrink-0">
                {selected.avgPrice !== null && (
                  <>
                    <p className="text-3xl font-bold font-mono text-white">
                      {selected.avgPrice.toFixed(2)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">{ui.avgPrice} · {ui.allMarketsAvg}</p>
                  </>
                )}
                {changePct !== null && changePct !== undefined && (
                  <p className={`text-base font-mono font-bold mt-1 ${changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {changePct >= 0 ? '▲ +' : '▼ '}{changePct.toFixed(2)}%
                  </p>
                )}
              </div>
            </div>

            {/* Controls: period + market */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex gap-1">
                {(Object.keys(PERIOD_DAYS) as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded px-4 py-1.5 text-sm font-semibold transition-colors ${
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
                  className="rounded-md bg-zinc-800 border border-zinc-600 px-3 py-1.5 text-sm text-zinc-100 font-medium outline-none focus:ring-1 focus:ring-green-500 cursor-pointer"
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
            <div className="flex-1 min-h-0 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
              {loading ? (
                <div className="flex h-full items-center justify-center text-zinc-400 text-sm">{ui.loading}</div>
              ) : candlesticks.length > 0 ? (
                <PriceChart data={candlesticks} height={undefined} className="h-full" />
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
            {stats && (
              <div className="grid grid-cols-3 gap-3 shrink-0">
                {[
                  { label: ui.high, value: stats.high.toFixed(2), color: 'text-green-400' },
                  { label: ui.avg, value: stats.avg.toFixed(2), color: 'text-white' },
                  { label: ui.low, value: stats.low.toFixed(2), color: 'text-red-400' },
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
            <div className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden">
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
