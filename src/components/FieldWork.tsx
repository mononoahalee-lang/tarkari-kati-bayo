'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Locale } from '@/types'

type VegOption = { id: string; nameEn: string; nameNe: string; nameJa: string; unit: string }
type MarketOption = { id: string; nameEn: string; nameNe: string; district: string }

type Observation = {
  id: string
  date: string
  storeName: string
  location: string
  vegetableId: string
  vegetableEn: string
  vegetableNe: string
  vegetableJa: string
  unit: string
  marketId: string | null
  marketEn: string | null
  marketNe: string | null
  observedPrice: number
  marketPrice: number | null
  note: string | null
  createdAt: string
}

const UI = {
  ne: {
    title: 'फिल्ड वर्क', subtitle: 'बजार मूल्य रेकर्ड',
    date: 'मिति', store: 'पसल', location: 'स्थान',
    market: 'बजार (तुलनाको लागि)', vegetable: 'तरकारी',
    observed: 'अवलोकन मूल्य (NPR/kg)', note: 'नोट (वैकल्पिक)',
    save: 'सुरक्षित गर्नुहोस्', saving: 'सुरक्षित हुँदैछ...',
    history: 'रेकर्ड इतिहास', noData: 'कुनै रेकर्ड छैन',
    colDate: 'मिति', colStore: 'पसल', colVeg: 'तरकारी',
    colObserved: 'अवलोकन', colMarket: 'बजार', colDiff: 'अन्तर',
    colNote: 'नोट', delete: 'मेट्नु',
    selectMarket: 'बजार छान्नुहोस्', selectVeg: 'तरकारी छान्नुहोस्',
    noMarket: 'बजार तुलना गरिएन', loading: 'लोड हुँदैछ...',
    diffTooltipHigh: 'बजार भन्दा महंगो', diffTooltipLow: 'बजार भन्दा सस्तो',
    required: 'आवश्यक फिल्ड भर्नुहोस्',
  },
  en: {
    title: 'Field Work', subtitle: 'Record actual store prices',
    date: 'Date', store: 'Store Name', location: 'Location',
    market: 'Market (for comparison)', vegetable: 'Vegetable',
    observed: 'Observed Price (NPR/kg)', note: 'Note (optional)',
    save: 'Save Record', saving: 'Saving...',
    history: 'Record History', noData: 'No records yet',
    colDate: 'Date', colStore: 'Store', colVeg: 'Vegetable',
    colObserved: 'Store Price', colMarket: 'Market Price', colDiff: 'Diff',
    colNote: 'Note', delete: 'Delete',
    selectMarket: 'Select market', selectVeg: 'Select vegetable',
    noMarket: 'No market selected', loading: 'Loading...',
    diffTooltipHigh: 'More expensive than market', diffTooltipLow: 'Cheaper than market',
    required: 'Please fill in required fields',
  },
  ja: {
    title: 'フィールドワーク', subtitle: '実際の店頭価格を記録',
    date: '日付', store: '商店名', location: '場所',
    market: '比較市場', vegetable: '野菜',
    observed: '聞き取り価格 (NPR/kg)', note: 'メモ（任意）',
    save: '記録を保存', saving: '保存中...',
    history: '記録一覧', noData: '記録がありません',
    colDate: '日付', colStore: '商店', colVeg: '野菜',
    colObserved: '店頭価格', colMarket: '市場価格', colDiff: '差額',
    colNote: 'メモ', delete: '削除',
    selectMarket: '市場を選択', selectVeg: '野菜を選択',
    noMarket: '市場未選択', loading: '読み込み中...',
    diffTooltipHigh: '市場より高い', diffTooltipLow: '市場より安い',
    required: '必須項目を入力してください',
  },
}

function diffDisplay(observed: number, market: number | null) {
  if (market === null || market === 0) return null
  const diff = observed - market
  const pct = (diff / market) * 100
  return { diff, pct, cheap: diff < 0 }
}

interface Props {
  vegetables: VegOption[]
  markets: MarketOption[]
  locale: Locale
}

export default function FieldWork({ vegetables, markets, locale }: Props) {
  const ui = UI[locale]
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    date: today,
    storeName: '',
    location: '',
    marketId: '',
    vegetableId: '',
    observedPrice: '',
    note: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [observations, setObservations] = useState<Observation[]>([])
  const [loadingObs, setLoadingObs] = useState(true)

  const loadObservations = useCallback(async () => {
    setLoadingObs(true)
    try {
      const res = await fetch('/api/field-work')
      if (res.ok) setObservations(await res.json())
    } finally {
      setLoadingObs(false)
    }
  }, [])

  useEffect(() => { loadObservations() }, [loadObservations])

  const handleSave = async () => {
    if (!form.date || !form.storeName || !form.vegetableId || !form.observedPrice) {
      setError(ui.required)
      return
    }
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/field-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          marketId: form.marketId || null,
          observedPrice: Number(form.observedPrice),
        }),
      })
      if (res.ok) {
        const created: Observation = await res.json()
        setObservations((prev) => [created, ...prev])
        setForm((f) => ({ ...f, storeName: '', location: '', observedPrice: '', note: '' }))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this record?')) return
    await fetch(`/api/field-work/${id}`, { method: 'DELETE' })
    setObservations((prev) => prev.filter((o) => o.id !== id))
  }

  const vegName = (o: Observation) =>
    locale === 'ne' ? o.vegetableNe : locale === 'ja' ? o.vegetableJa : o.vegetableEn
  const mktName = (o: Observation) =>
    locale === 'ne' ? o.marketNe : o.marketEn

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{ui.title}</h1>
        <p className="text-sm text-zinc-400 mt-1">{ui.subtitle}</p>
      </div>

      {/* Entry Form */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Date */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{ui.date}</label>
            <input
              type="date"
              value={form.date}
              max={today}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {/* Vegetable */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{ui.vegetable} *</label>
            <select
              value={form.vegetableId}
              onChange={(e) => setForm((f) => ({ ...f, vegetableId: e.target.value }))}
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">{ui.selectVeg}</option>
              {vegetables.map((v) => (
                <option key={v.id} value={v.id}>
                  {locale === 'ne' ? v.nameNe : locale === 'ja' ? v.nameJa : v.nameEn}
                </option>
              ))}
            </select>
          </div>

          {/* Store Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{ui.store} *</label>
            <input
              type="text"
              value={form.storeName}
              onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
              placeholder="e.g. Laxmi Tarkari Pasal"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {/* Location */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{ui.location}</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Lakeside, Pokhara"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {/* Observed Price */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{ui.observed} *</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.observedPrice}
              onChange={(e) => setForm((f) => ({ ...f, observedPrice: e.target.value }))}
              placeholder="e.g. 60"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {/* Market for comparison */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{ui.market}</label>
            <select
              value={form.marketId}
              onChange={(e) => setForm((f) => ({ ...f, marketId: e.target.value }))}
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">{ui.selectMarket}</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {locale === 'ne' ? m.nameNe : m.nameEn} ({m.district})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Note */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{ui.note}</label>
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="e.g. 新鮮だった / Fresh stock arrived today"
            className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 px-6 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          {saving ? ui.saving : ui.save}
        </button>
      </div>

      {/* History Table */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">{ui.history}</h2>
          <span className="text-xs text-zinc-500">{observations.length} records</span>
        </div>

        {loadingObs ? (
          <div className="p-6 text-center text-sm text-zinc-500">{ui.loading}</div>
        ) : observations.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">{ui.noData}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">{ui.colDate}</th>
                  <th className="px-4 py-2 text-left">{ui.colStore}</th>
                  <th className="px-4 py-2 text-left">{ui.colVeg}</th>
                  <th className="px-4 py-2 text-right">{ui.colObserved}</th>
                  <th className="px-4 py-2 text-right">{ui.colMarket}</th>
                  <th className="px-4 py-2 text-right">{ui.colDiff}</th>
                  <th className="px-4 py-2 text-left hidden sm:table-cell">{ui.colNote}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {observations.map((o) => {
                  const d = diffDisplay(o.observedPrice, o.marketPrice)
                  return (
                    <tr key={o.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">{o.date}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-zinc-100 whitespace-nowrap">{o.storeName}</div>
                        {o.location && <div className="text-xs text-zinc-500">{o.location}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-zinc-100 whitespace-nowrap">{vegName(o)}</div>
                        {o.marketEn && (
                          <div className="text-xs text-zinc-500">{mktName(o)}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-white">
                        {o.observedPrice.toFixed(0)}
                        <span className="text-xs text-zinc-500 ml-0.5">/{o.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-zinc-400">
                        {o.marketPrice !== null ? o.marketPrice.toFixed(0) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {d ? (
                          <span className={`font-mono font-semibold ${d.cheap ? 'text-green-400' : 'text-red-400'}`}>
                            {d.cheap ? '' : '+'}{d.diff.toFixed(0)}
                            <span className="text-xs ml-0.5 font-normal opacity-80">
                              ({d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs hidden sm:table-cell max-w-[120px] truncate">
                        {o.note ?? ''}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="text-zinc-600 hover:text-red-400 transition-colors text-xs"
                        >
                          {ui.delete}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
