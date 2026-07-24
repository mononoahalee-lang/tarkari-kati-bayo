'use client'

import { useMemo, useState } from 'react'
import type { Locale } from '@/types'

export interface SeedVarietyRow {
  id: string
  n: string // name
  nn: string // nepName
  c: string // cropName
  cs: string // cropSlug
  o: string // ownerType
  t: string | null // typeOpHybrid
  reg: boolean
  rd: string | null // releasedDate (YYYY-MM-DD)
  fy: number | null
  area: string | null
}

const OWNER_LABEL: Record<string, string> = { narc: 'NARC', private: 'Private', other: 'Other' }
const OWNER_COLOR: Record<string, string> = {
  narc: 'bg-teal-900/40 text-teal-300 border-teal-700/40',
  private: 'bg-amber-900/40 text-amber-300 border-amber-700/40',
  other: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return d
  return `${day} ${MONTHS[parseInt(m, 10) - 1]} ${y}`
}

type SortKey = 'n' | 'o' | 't' | 'reg' | 'rd' | 'area'

const UI = {
  en: {
    cropLabel: 'Crop', searchLabel: 'Search variety name', searchPlaceholder: 'e.g. Sabitri, Hardinath…',
    ownerLabel: 'Owner type', statusLabel: 'Status', registeredOnly: 'Registered only',
    colVariety: 'Variety', colOwner: 'Owner', colType: 'Type', colRegistered: 'Registered',
    colReleased: 'Released', colAreas: 'Recommended areas', empty: 'No varieties match the current filters.',
    shown: 'shown', varieties: 'varieties', narcBred: 'NARC-bred', registered: 'Registered',
    of: 'of',
  },
  ja: {
    cropLabel: '作物', searchLabel: '品種名で検索', searchPlaceholder: '例: Sabitri, Hardinath…',
    ownerLabel: '所有者タイプ', statusLabel: 'ステータス', registeredOnly: '登録済みのみ',
    colVariety: '品種', colOwner: '所有者', colType: 'タイプ', colRegistered: '登録',
    colReleased: 'リリース日', colAreas: '推奨栽培地域', empty: '条件に一致する品種がありません。',
    shown: '件表示', varieties: '品種', narcBred: '国営研究機関育成', registered: '登録済み',
    of: '/',
  },
  ne: {
    cropLabel: 'बाली', searchLabel: 'किसिमको नाम खोज्नुहोस्', searchPlaceholder: 'जस्तै Sabitri, Hardinath…',
    ownerLabel: 'स्वामित्व प्रकार', statusLabel: 'स्थिति', registeredOnly: 'दर्ता भएका मात्र',
    colVariety: 'किसिम', colOwner: 'स्वामित्व', colType: 'प्रकार', colRegistered: 'दर्ता',
    colReleased: 'रिलीज मिति', colAreas: 'सिफारिस क्षेत्र', empty: 'फिल्टरसँग मेल खाने किसिम भेटिएन।',
    shown: 'देखाइयो', varieties: 'किसिमहरू', narcBred: 'NARC विकसित', registered: 'दर्ता भएका',
    of: '/',
  },
}

export default function SeedRegistryExplorer({
  data,
  crops,
  locale,
}: {
  data: SeedVarietyRow[]
  crops: { name: string; count: number }[]
  locale: Locale
}) {
  const ui = UI[locale]
  const [crop, setCrop] = useState(crops[0]?.name ?? '')
  const [search, setSearch] = useState('')
  const [owners, setOwners] = useState<Set<string>>(new Set())
  const [registeredOnly, setRegisteredOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('n')
  const [sortDir, setSortDir] = useState<1 | -1>(1)

  const cropTotal = crops.find((c) => c.name === crop)?.count ?? 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.filter((v) => {
      if (v.c !== crop) return false
      if (owners.size && !owners.has(v.o)) return false
      if (registeredOnly && !v.reg) return false
      if (q && !v.n.toLowerCase().includes(q) && !(v.nn ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [data, crop, search, owners, registeredOnly])

  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      let av: string | number | boolean = a[sortKey] ?? ''
      let bv: string | number | boolean = b[sortKey] ?? ''
      if (sortKey === 'reg') { av = av ? 1 : 0; bv = bv ? 1 : 0 }
      if (av < bv) return -1 * sortDir
      if (av > bv) return 1 * sortDir
      return a.n.localeCompare(b.n)
    })
    return rows
  }, [filtered, sortKey, sortDir])

  const stats = useMemo(() => {
    const counts = { narc: 0, private: 0, other: 0 }
    let registered = 0
    for (const v of filtered) {
      if (v.o in counts) counts[v.o as keyof typeof counts]++
      if (v.reg) registered++
    }
    return { counts, registered, total: filtered.length }
  }, [filtered])

  function toggleOwner(k: string) {
    setOwners((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1))
    else { setSortKey(key); setSortDir(1) }
  }

  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0)

  return (
    <div className="space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="bg-zinc-900 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{crop}</p>
          <p className="text-2xl font-bold font-mono text-zinc-100">{stats.total}</p>
        </div>
        <div className="bg-zinc-900 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{ui.narcBred}</p>
          <p className="text-2xl font-bold font-mono text-teal-400">{stats.counts.narc}<span className="text-xs text-zinc-500 ml-1">{pct(stats.counts.narc)}%</span></p>
        </div>
        <div className="bg-zinc-900 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Private</p>
          <p className="text-2xl font-bold font-mono text-amber-400">{stats.counts.private}<span className="text-xs text-zinc-500 ml-1">{pct(stats.counts.private)}%</span></p>
        </div>
        <div className="bg-zinc-900 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{ui.registered}</p>
          <p className="text-2xl font-bold font-mono text-zinc-100">{stats.registered}<span className="text-xs text-zinc-500 ml-1">{pct(stats.registered)}%</span></p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">{ui.cropLabel}</label>
          <select
            value={crop}
            onChange={(e) => setCrop(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-sm text-zinc-100"
          >
            {crops.map((c) => (
              <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">{ui.searchLabel}</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={ui.searchPlaceholder}
            className="bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">{ui.ownerLabel}</label>
          <div className="flex gap-1.5">
            {(['narc', 'private', 'other'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleOwner(k)}
                aria-pressed={owners.has(k)}
                className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
                  owners.has(k) ? OWNER_COLOR[k] : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {OWNER_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">{ui.statusLabel}</label>
          <button
            type="button"
            onClick={() => setRegisteredOnly((v) => !v)}
            aria-pressed={registeredOnly}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
              registeredOnly ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200'
            }`}
          >
            {ui.registeredOnly}
          </button>
        </div>
        <div className="ml-auto text-xs text-zinc-500 font-mono">
          {filtered.length} {ui.of} {cropTotal} {ui.shown}
        </div>
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-xl overflow-x-auto bg-zinc-900">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              {([
                ['n', ui.colVariety],
                ['o', ui.colOwner],
                ['t', ui.colType],
                ['reg', ui.colRegistered],
                ['rd', ui.colReleased],
                ['area', ui.colAreas],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={`px-3.5 py-2.5 text-left text-[11px] uppercase tracking-wider font-semibold cursor-pointer select-none hover:text-zinc-300 ${sortKey === key ? 'text-amber-400' : ''}`}
                >
                  {label} {sortKey === key ? (sortDir === 1 ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="text-center text-zinc-600 italic py-10">{ui.empty}</td></tr>
            )}
            {sorted.map((v) => (
              <tr key={v.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                <td className="px-3.5 py-2.5">
                  <p className="font-medium text-zinc-100">{v.n}</p>
                  {v.nn && <p className="text-[11px] text-zinc-500">{v.nn}</p>}
                </td>
                <td className="px-3.5 py-2.5">
                  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${OWNER_COLOR[v.o] ?? 'border-zinc-700 text-zinc-400'}`}>
                    {OWNER_LABEL[v.o] ?? v.o}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-zinc-300">{v.t ?? '—'}</td>
                <td className="px-3.5 py-2.5">
                  <span className={v.reg ? 'text-teal-400 font-semibold' : 'text-zinc-600'}>{v.reg ? '✓' : '—'}</span>
                </td>
                <td className="px-3.5 py-2.5 text-zinc-400 font-mono whitespace-nowrap">
                  {fmtDate(v.rd)}{v.fy ? <span className="text-zinc-600"> FY{v.fy}</span> : null}
                </td>
                <td className="px-3.5 py-2.5 text-zinc-400 text-xs max-w-[28ch]">{v.area ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
