import { hasLocale, getDictionary } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import PriceIndexChart, { type IndexPoint } from '@/components/PriceIndexChart'
import { toDateStr, isStaleDateStr } from '@/lib/freshness'

export const revalidate = 43200 // cache for 12h; cron invalidates on-demand after scraping

type VegRow = {
  id: string
  nameNe: string
  nameEn: string
  nameJa: string
  unit: string
  avgPrice: number | null
  minPrice: number | null
  maxPrice: number | null
  changePct: number | null
  date: string | null
  isStale: boolean
}

type MarketInfo = {
  id: string
  nameEn: string
  nameNe: string
  source: string
  recordCount: number
  latestDate: string | null
  isStale: boolean
}

async function getMarkets(): Promise<MarketInfo[]> {
  const [markets, latestPerMarket] = await Promise.all([
    prisma.market.findMany({
      select: {
        id: true,
        nameEn: true,
        nameNe: true,
        source: true,
        _count: { select: { prices: true } },
      },
      orderBy: [{ source: 'asc' }, { nameEn: 'asc' }],
    }),
    prisma.$queryRaw<Array<{ marketId: string; latest: Date }>>`
      SELECT "marketId", MAX(date) as latest FROM "PriceRecord" GROUP BY "marketId"
    `,
  ])
  const latestMap = new Map(latestPerMarket.map((r) => [r.marketId, toDateStr(r.latest)]))
  return markets
    .filter((m) => m._count.prices > 0)
    .map((m) => {
      const latestDate = latestMap.get(m.id) ?? null
      return { ...m, recordCount: m._count.prices, latestDate, isStale: isStaleDateStr(latestDate) }
    })
}

async function getPriceRows(marketId?: string): Promise<VegRow[]> {
  const vegetables = await prisma.vegetable.findMany({
    select: { id: true, nameNe: true, nameEn: true, nameJa: true, unit: true },
    orderBy: { nameEn: 'asc' },
  })

  if (vegetables.length === 0) return []

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Raw SQL ensures correct DISTINCT ON semantics (most recent row per vegetable)
  const [latestPerVeg, prevPerVeg] = await Promise.all([
    marketId
      ? prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number; minPrice: number; maxPrice: number; date: Date }>>`
          SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice", "minPrice", "maxPrice", "date"
          FROM "PriceRecord"
          WHERE "marketId" = ${marketId}
          ORDER BY "vegetableId", "date" DESC
        `
      : prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number; minPrice: number; maxPrice: number; date: Date }>>`
          SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice", "minPrice", "maxPrice", "date"
          FROM "PriceRecord"
          ORDER BY "vegetableId", "date" DESC
        `,
    marketId
      ? prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number }>>`
          SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice"
          FROM "PriceRecord"
          WHERE "marketId" = ${marketId} AND "date" <= ${sevenDaysAgo}
          ORDER BY "vegetableId", "date" DESC
        `
      : prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number }>>`
          SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice"
          FROM "PriceRecord"
          WHERE "date" <= ${sevenDaysAgo}
          ORDER BY "vegetableId", "date" DESC
        `,
  ])

  const latestMap = new Map(latestPerVeg.map((r) => [r.vegetableId, { ...r, avgPrice: Number(r.avgPrice), minPrice: Number(r.minPrice), maxPrice: Number(r.maxPrice) }]))
  const prevMap = new Map(prevPerVeg.map((r) => [r.vegetableId, Number(r.avgPrice)]))

  return vegetables.map((v) => {
    const latest = latestMap.get(v.id)
    const dateStr = latest?.date ? toDateStr(latest.date) : null
    const isStale = isStaleDateStr(dateStr)
    const prevAvg = prevMap.get(v.id) ?? null
    const changePct =
      !isStale && latest?.avgPrice && prevAvg && prevAvg > 0
        ? ((latest.avgPrice - prevAvg) / prevAvg) * 100
        : null
    return {
      ...v,
      avgPrice: isStale ? null : latest?.avgPrice ?? null,
      minPrice: isStale ? null : latest?.minPrice ?? null,
      maxPrice: isStale ? null : latest?.maxPrice ?? null,
      changePct,
      date: dateStr,
      isStale,
    }
  })
}

type SpreadRow = {
  vegetableId: string
  nameEn: string
  nameNe: string
  nameJa: string
  unit: string
  minPrice: number
  maxPrice: number
  minMarket: string
  maxMarket: string
  spreadPct: number
}

async function getIndexData(): Promise<IndexPoint[]> {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  const rows = await prisma.$queryRaw<Array<{ date: string; avgPrice: number }>>`
    SELECT date::text AS date, AVG("avgPrice")::float AS "avgPrice"
    FROM "PriceRecord"
    WHERE date >= ${since}
    GROUP BY date
    ORDER BY date ASC
  `
  return rows.map((r) => ({ date: r.date.split('T')[0], avgPrice: Number(r.avgPrice) }))
}

async function getMarketSpread(): Promise<SpreadRow[]> {
  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    // Get one price per vegetable per market (most recent within 3 days)
    const recent = await prisma.$queryRaw<Array<{
      vegetableId: string; marketId: string; avgPrice: number; marketEn: string
    }>>`
      SELECT DISTINCT ON ("vegetableId", "marketId")
        p."vegetableId", p."marketId", p."avgPrice"::float, m."nameEn" as "marketEn"
      FROM "PriceRecord" p
      JOIN "Market" m ON m.id = p."marketId"
      WHERE p.date >= ${since}
      ORDER BY "vegetableId", "marketId", p.date DESC
    `

    // Group by vegetable in JS to find min/max markets
    const byVeg = new Map<string, Array<{ avgPrice: number; marketEn: string }>>()
    for (const r of recent) {
      const arr = byVeg.get(r.vegetableId) ?? []
      arr.push({ avgPrice: Number(r.avgPrice), marketEn: r.marketEn })
      byVeg.set(r.vegetableId, arr)
    }

    // Only keep vegetables that appear in 2+ markets
    const candidates: Array<{
      vegetableId: string; minPrice: number; maxPrice: number
      minMarket: string; maxMarket: string; spreadPct: number
    }> = []
    for (const [vegId, entries] of byVeg) {
      if (entries.length < 2) continue
      const sorted = [...entries].sort((a, b) => a.avgPrice - b.avgPrice)
      const min = sorted[0], max = sorted[sorted.length - 1]
      if (min.avgPrice <= 0) continue
      const spreadPct = ((max.avgPrice - min.avgPrice) / min.avgPrice) * 100
      if (spreadPct < 1) continue
      candidates.push({ vegetableId: vegId, minPrice: min.avgPrice, maxPrice: max.avgPrice, minMarket: min.marketEn, maxMarket: max.marketEn, spreadPct })
    }
    candidates.sort((a, b) => b.spreadPct - a.spreadPct)
    const top = candidates.slice(0, 6)

    if (top.length === 0) return []
    const vegIds = top.map(c => c.vegetableId)
    const vegs = await prisma.vegetable.findMany({
      where: { id: { in: vegIds } },
      select: { id: true, nameEn: true, nameNe: true, nameJa: true, unit: true },
    })
    const vegMap = new Map(vegs.map(v => [v.id, v]))

    return top.flatMap(c => {
      const v = vegMap.get(c.vegetableId)
      if (!v) return []
      return [{ ...c, ...v, vegetableId: c.vegetableId, spreadPct: Math.round(c.spreadPct * 10) / 10 }]
    })
  } catch (e) {
    console.error('getMarketSpread error:', e)
    return []
  }
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-zinc-500">—</span>
  const isUp = pct >= 0
  return (
    <span className={`font-mono text-sm font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
      {isUp ? '+' : ''}{pct.toFixed(2)}%
    </span>
  )
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams?: Promise<{ marketId?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const locale = lang as Locale
  const sp = (await searchParams) ?? {}
  const selectedMarketId = sp.marketId

  const [dict, rows, markets, spread, indexData] = await Promise.all([
    getDictionary(locale),
    getPriceRows(selectedMarketId),
    getMarkets(),
    getMarketSpread(),
    getIndexData(),
  ])

  const getName = (row: VegRow) =>
    locale === 'ne' ? row.nameNe : locale === 'ja' ? row.nameJa : row.nameEn

  // Rows that have ever had a price record, even if the latest one is stale.
  // Stale rows are kept visible (avgPrice null) instead of silently dropped,
  // so missing data is explicit rather than indistinguishable from "no data ever".
  const withData = rows.filter((r) => r.date !== null)
  const freshRows = withData.filter((r) => r.avgPrice !== null)
  const lastUpdated = withData.reduce<string | null>(
    (max, r) => (r.date && (!max || r.date > max) ? r.date : max),
    null
  )
  const gainers = [...freshRows]
    .filter((r) => (r.changePct ?? 0) > 0)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, 5)
  const losers = [...freshRows]
    .filter((r) => (r.changePct ?? 0) < 0)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, 5)

  const chartLabel =
    locale === 'ne' ? 'चार्ट हेर्नुहोस् →' : locale === 'ja' ? 'チャートを見る →' : 'View Price Charts →'
  const chartDesc =
    locale === 'ne' ? 'मूल्य इतिहास र बजार तुलना' : locale === 'ja' ? '価格履歴・市場別比較' : 'Price history & market comparison'

  const selectedMarket = markets.find((m) => m.id === selectedMarketId)
  const marketLabel = selectedMarket
    ? locale === 'ne'
      ? selectedMarket.nameNe
      : selectedMarket.nameEn
    : locale === 'ne'
    ? 'सबै बजार'
    : locale === 'ja'
    ? '全市場'
    : 'All Markets'

  // Source info string shown in the table header
  const sourceInfo = selectedMarket
    ? `${selectedMarket.nameEn} Market`
    : 'Kalimati + AMPIS (aggregate)'

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{dict.home.title}</h1>
          <p className="text-sm text-zinc-400 mt-1">{dict.home.subtitle}</p>
          {lastUpdated && (
            <p className="text-xs text-zinc-500 mt-1">
              {dict.home.updated}: {lastUpdated}
              {' · '}
              <span className="text-zinc-400 font-medium">{sourceInfo}</span>
            </p>
          )}
          {selectedMarket?.isStale && (
            <p className="text-xs text-amber-500 mt-1">
              ⚠ {selectedMarket.nameEn}{' '}
              {locale === 'ja'
                ? `のデータは最新ではありません（最終更新: ${selectedMarket.latestDate}）`
                : locale === 'ne'
                ? `डाटा अद्यावधिक छैन (अन्तिम: ${selectedMarket.latestDate})`
                : `data is not up to date (last updated: ${selectedMarket.latestDate})`}
            </p>
          )}
        </div>
        <Link
          href={`/${locale}/chart`}
          className="flex items-center gap-3 rounded-xl border border-green-700 bg-green-950/50 px-4 py-3 hover:bg-green-900/50 transition-colors group"
        >
          <span className="text-2xl">📈</span>
          <div>
            <p className="text-sm font-bold text-green-400 group-hover:text-green-300">{chartLabel}</p>
            <p className="text-xs text-zinc-400">{chartDesc}</p>
          </div>
        </Link>
      </div>

      {/* Mobile market selector — shown at top on mobile so users don't need to scroll */}
      <div className="sm:hidden rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <p className="text-xs text-zinc-500 mb-2">
          {locale === 'ne' ? 'बजार' : locale === 'ja' ? '市場選択' : 'Select Market'}
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <Link
            href={`/${locale}`}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              !selectedMarketId ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {locale === 'ne' ? 'सबै' : locale === 'ja' ? '全市場' : 'All'}
          </Link>
          {markets.map((m) => (
            <Link
              key={m.id}
              href={`/${locale}?marketId=${m.id}`}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedMarketId === m.id
                  ? m.source === 'kalimati' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {m.isStale && <span className="text-amber-400 mr-0.5">⚠</span>}
              {locale === 'ne' ? m.nameNe : m.nameEn}
            </Link>
          ))}
        </div>
      </div>

      {/* Price Index Chart */}
      {indexData.length > 0 && (
        <PriceIndexChart data={indexData} locale={locale} />
      )}

      {withData.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
          {dict.home.noData}
        </div>
      ) : (
        <>
          {/* Top Movers */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Gainers */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wider">
                  {dict.home.topGainers}
                </h2>
                <span className="text-[10px] text-zinc-500">{dict.home.vsWeekAgo}</span>
              </div>
              <div className="space-y-2">
                {gainers.length === 0 ? (
                  <p className="text-xs text-zinc-500">{dict.home.noData}</p>
                ) : (
                  gainers.map((row) => (
                    <Link
                      key={row.id}
                      href={`/${locale}/vegetables/${row.id}`}
                      className="flex items-center justify-between rounded px-2 py-1 hover:bg-zinc-800 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{getName(row)}</p>
                        <p className="text-xs text-zinc-500">NPR {row.avgPrice?.toFixed(2)}</p>
                      </div>
                      <ChangeBadge pct={row.changePct} />
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Losers */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">
                  {dict.home.topLosers}
                </h2>
                <span className="text-[10px] text-zinc-500">{dict.home.vsWeekAgo}</span>
              </div>
              <div className="space-y-2">
                {losers.length === 0 ? (
                  <p className="text-xs text-zinc-500">{dict.home.noData}</p>
                ) : (
                  losers.map((row) => (
                    <Link
                      key={row.id}
                      href={`/${locale}/vegetables/${row.id}`}
                      className="flex items-center justify-between rounded px-2 py-1 hover:bg-zinc-800 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{getName(row)}</p>
                        <p className="text-xs text-zinc-500">NPR {row.avgPrice?.toFixed(2)}</p>
                      </div>
                      <ChangeBadge pct={row.changePct} />
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Market spread ranking */}
          {spread.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">
                  {locale === 'ne' ? '🏪 बजार मूल्य अन्तर' : locale === 'ja' ? '🏪 市場間価格差 TOP6' : '🏪 Market Price Gap TOP6'}
                </h2>
                <span className="text-[10px] text-zinc-500">
                  {locale === 'ne' ? 'न्यून बजार → उच्च बजार' : locale === 'ja' ? '最安市場 → 最高市場' : 'Cheapest → Most Expensive'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {spread.map((row) => {
                  const name = locale === 'ne' ? row.nameNe : locale === 'ja' ? row.nameJa : row.nameEn
                  return (
                    <Link
                      key={row.vegetableId}
                      href={`/${locale}/vegetables/${row.vegetableId}`}
                      className="flex items-center justify-between rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2 hover:border-zinc-500 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{name}</p>
                        <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {row.minMarket} <span className="text-zinc-600">→</span> {row.maxMarket}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          {row.minPrice.toFixed(0)} → {row.maxPrice.toFixed(0)} NPR/{row.unit}
                        </p>
                      </div>
                      <span className="shrink-0 ml-2 text-sm font-bold font-mono text-yellow-400">
                        +{row.spreadPct.toFixed(0)}%
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Full table with market tabs */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
            {/* Market filter tabs */}
            <div className="px-4 pt-3 pb-0 border-b border-zinc-800">
              <div className="flex items-center justify-between gap-2 pb-2">
                <h2 className="text-sm font-semibold text-zinc-300 shrink-0">{dict.home.allVegetables}</h2>
              </div>
              {/* Horizontally scrollable market tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
                <Link
                  href={`/${locale}`}
                  className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    !selectedMarketId
                      ? 'bg-zinc-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {locale === 'ne' ? 'सबै' : locale === 'ja' ? '全市場' : 'All'}
                </Link>
                {markets.map((m) => (
                  <Link
                    key={m.id}
                    href={`/${locale}?marketId=${m.id}`}
                    className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      selectedMarketId === m.id
                        ? m.source === 'kalimati'
                          ? 'bg-green-600 text-white'
                          : 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {m.isStale && <span className="text-amber-400 mr-0.5">⚠</span>}
                    {locale === 'ne' ? m.nameNe : m.nameEn}
                  </Link>
                ))}
              </div>
              {selectedMarket && (
                <p className="pb-2 text-xs text-zinc-500">
                  {locale === 'ne' ? 'स्रोत' : locale === 'ja' ? '出典' : 'Source'}:{' '}
                  <span className="text-zinc-300 font-medium">
                    {selectedMarket.source === 'kalimati' ? 'Kalimati Market (kalimatimarket.gov.np)' : `AMPIS — ${selectedMarket.nameEn}, ${selectedMarket.source === 'ampis' ? 'Nepal Agriculture' : ''}`}
                  </span>
                </p>
              )}
              {!selectedMarket && (
                <p className="pb-2 text-xs text-zinc-500">
                  {locale === 'ne' ? 'स्रोत' : locale === 'ja' ? '出典' : 'Source'}:{' '}
                  <span className="text-zinc-300 font-medium">Kalimati (kalimatimarket.gov.np) + AMPIS markets</span>
                </p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">
                      {locale === 'ne' ? 'नाम' : locale === 'ja' ? '野菜' : 'Vegetable'}
                    </th>
                    <th className="hidden sm:table-cell px-4 py-2 text-right">{dict.price.min}</th>
                    <th className="hidden sm:table-cell px-4 py-2 text-right">{dict.price.max}</th>
                    <th className="px-4 py-2 text-right">{dict.price.avg}</th>
                    <th className="px-4 py-2 text-right">{dict.price.change}</th>
                  </tr>
                </thead>
                <tbody>
                  {withData.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors ${
                        i % 2 === 0 ? '' : 'bg-zinc-900/30'
                      }`}
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/${locale}/vegetables/${row.id}`}
                          className="font-medium text-zinc-100 hover:text-green-400 transition-colors"
                        >
                          {getName(row)}
                        </Link>
                        <span className="ml-1 text-xs text-zinc-600">/{row.unit}</span>
                        {row.isStale && (
                          <span className="ml-1.5 text-[10px] text-amber-500" title={row.date ?? undefined}>
                            ⚠ {row.date}
                          </span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2 text-right font-mono text-zinc-400">
                        {row.minPrice !== null ? row.minPrice.toFixed(0) : '—'}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2 text-right font-mono text-zinc-400">
                        {row.maxPrice !== null ? row.maxPrice.toFixed(0) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-100">
                        {row.avgPrice !== null ? row.avgPrice.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ChangeBadge pct={row.changePct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
