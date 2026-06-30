'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { Locale } from '@/types'
import type { MarketHistoryPoint } from './MultiMarketChart'

const MultiMarketChart = dynamic(() => import('./MultiMarketChart'), { ssr: false })

type VegItem = {
  id: string
  nameNe: string
  nameEn: string
  nameJa: string
  unit: string
}

function getName(v: VegItem, locale: Locale) {
  return locale === 'ne' ? v.nameNe : locale === 'ja' ? v.nameJa : v.nameEn
}

const UI: Record<Locale, { search: string; select: string; loading: string }> = {
  ne: { search: 'तरकारी खोज्नुहोस्...', select: 'तरकारी चुन्नुहोस्', loading: 'लोड हुँदैछ...' },
  en: { search: 'Search vegetables...', select: 'Select a vegetable', loading: 'Loading...' },
  ja: { search: '野菜を検索...', select: '野菜を選択', loading: '読み込み中...' },
}

interface Props {
  vegetables: VegItem[]
  locale: Locale
}

export default function CompareExplorer({ vegetables, locale }: Props) {
  const ui = UI[locale]
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(vegetables[0]?.id ?? null)
  const [data, setData] = useState<MarketHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)

  const selected = useMemo(() => vegetables.find((v) => v.id === selectedId) ?? null, [vegetables, selectedId])

  const filtered = useMemo(() => {
    if (!query) return vegetables
    const q = query.toLowerCase()
    return vegetables.filter(
      (v) => v.nameEn.toLowerCase().includes(q) || v.nameNe.includes(query) || v.nameJa.includes(query)
    )
  }, [vegetables, query])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    fetch(`/api/vegetables/${selectedId}/market-history`)
      .then((r) => r.json())
      .then((d: MarketHistoryPoint[]) => setData(d))
      .finally(() => setLoading(false))
  }, [selectedId])

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6">
      <div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ui.search}
          className="w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 mb-2 focus:outline-none focus:border-green-600"
        />
        <div className="max-h-[60vh] overflow-y-auto space-y-0.5 rounded-md border border-zinc-800 bg-zinc-900/50">
          {filtered.map((v) => {
            const isSelected = v.id === selectedId
            return (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  isSelected ? 'bg-green-700 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {getName(v, locale)}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        {selected && (
          <div className="mb-3">
            <h1 className="text-xl font-bold text-white">{getName(selected, locale)}</h1>
            <p className="text-xs text-zinc-500">NPR / {selected.unit}</p>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-zinc-500 py-8 text-center">{ui.loading}</p>
        ) : (
          <MultiMarketChart data={data} locale={locale} />
        )}
      </div>
    </div>
  )
}
