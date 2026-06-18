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

type Period = '1W' | '1M' | '3M' | '1Y'
const PERIOD_DAYS: Record<Period, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }
const PERIOD_LABELS: Record<Period, Record<Locale, string>> = {
  '1W': { ne: '१ हप्ता', en: '1W', ja: '1週' },
  '1M': { ne: '१ महिना', en: '1M', ja: '1ヶ月' },
  '3M': { ne: '३ महिना', en: '3M', ja: '3ヶ月' },
  '1Y': { ne: '१ वर्ष', en: '1Y', ja: '1年' },
}

const UI: Record<Locale, {
  search: string; select: string; noData: string; high: string; low: string; avg: string
  loading: string; noPriceHistory: string; allMarkets: string; market: string
}> = {
  ne: {
    search: 'तरकारी खोज्नुहोस्...', select: 'तरकारी चुन्नुहोस्', noData: 'डेटा उपलब्ध छैन',
    high: 'उच्च', low: 'न्यून', avg: 'औसत', loading: 'लोड हुँदैछ...', noPriceHistory: 'मूल्य इतिहास उपलब्ध छैन',
    allMarkets: 'सबै बजार', market: 'बजार',
  },
  en: {
    search: 'Search vegetables...', select: 'Select a vegetable', noData: 'No data',
    high: 'High', low: 'Low', avg: 'Avg', loading: 'Loading...', noPriceHistory: 'No price history yet. Data is collected daily.',
    allMarkets: 'All Markets', market: 'Market',
  },
  ja: {
    search: '野菜を検索...', select: '野菜を選択', noData: 'データなし',
    high: '最高値', low: '最安値', avg: '平均', loading: '読み込み中...', noPriceHistory: '価格履歴がありません（毎日更新）',
    allMarkets: '全市場', market: '市場',
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

  const changePct = selected?.changePct
  const marketLabel = selectedMarketId === 'all'
    ? ui.allMarkets
    : (markets.find((m) => m.id === selectedMarketId)?.nameEn ?? ui.allMarkets)

  return (
    <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-8rem)]">
      {/* Left: vegetable list */}
      <div className="lg:w-72 xl:w-80 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-800 overflow-hidden">
        <div className="p-3 border-b border-zinc-800">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ui.search}
            className="w-full rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((v) => {
            const isSelected = v.id === selectedId
            const pct = v.changePct
            return (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 border-b border-zinc-900 ${isSelected ? 'bg-zinc-800 border-l-2 border-l-green-500' : ''}`}
              >
                <span className={`truncate ${isSelected ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>
                  {getName(v, locale)}
                </span>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {v.avgPrice !== null && (
                    <span className="font-mono text-xs text-zinc-400">{v.avgPrice.toFixed(0)}</span>
                  )}
                  {pct !== null && (
                    <span className={`font-mono text-xs ${pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
                <h1 className="text-xl font-bold text-zinc-100">{getName(selected, locale)}</h1>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {locale === 'ne' ? selected.nameEn : selected.nameNe} · NPR/{selected.unit}
                </p>
              </div>
              <div className="text-right shrink-0">
                {selected.avgPrice !== null && (
                  <p className="text-2xl font-bold font-mono text-zinc-100">
                    {selected.avgPrice.toFixed(2)}
                  </p>
                )}
                {changePct !== null && changePct !== undefined && (
                  <p className={`text-sm font-mono font-medium ${changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                  </p>
                )}
              </div>
            </div>

            {/* Controls: period + market */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Period tabs */}
              <div className="flex gap-1">
                {(Object.keys(PERIOD_DAYS) as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      p === period ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {PERIOD_LABELS[p][locale]}
                  </button>
                ))}
              </div>

              {/* Market selector */}
              <div className="ml-auto">
                <select
                  value={selectedMarketId}
                  onChange={(e) => setSelectedMarketId(e.target.value)}
                  className="rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-green-500 cursor-pointer"
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
            <div className="flex-1 min-h-0 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              {loading ? (
                <div className="flex h-full items-center justify-center text-zinc-500 text-sm">{ui.loading}</div>
              ) : candlesticks.length > 0 ? (
                <PriceChart data={candlesticks} height={undefined} className="h-full" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500 text-sm text-center px-4">
                  <span className="text-2xl">📊</span>
                  <p>{ui.noPriceHistory}</p>
                  {selectedMarketId !== 'all' && (
                    <button
                      onClick={() => setSelectedMarketId('all')}
                      className="mt-1 text-xs text-green-500 hover:text-green-400 underline"
                    >
                      → {ui.allMarkets}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-3 gap-2 shrink-0">
                {[
                  { label: ui.high, value: stats.high.toFixed(2) },
                  { label: ui.low, value: stats.low.toFixed(2) },
                  { label: ui.avg, value: stats.avg.toFixed(2) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-center">
                    <p className="text-xs text-zinc-500">{label}</p>
                    <p className="mt-0.5 font-mono text-base font-semibold text-zinc-100">{value}</p>
                    {label === ui.avg && (
                      <p className="text-xs text-zinc-600">{marketLabel}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500 text-sm">{ui.select}</div>
        )}
      </div>
    </div>
  )
}
