import { hasLocale, getDictionary } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

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
}

type MarketInfo = {
  id: string
  nameEn: string
  nameNe: string
  source: string
  recordCount: number
}

async function getMarkets(): Promise<MarketInfo[]> {
  const markets = await prisma.market.findMany({
    select: {
      id: true,
      nameEn: true,
      nameNe: true,
      source: true,
      _count: { select: { prices: true } },
    },
    orderBy: [{ source: 'asc' }, { nameEn: 'asc' }],
  })
  return markets
    .filter((m) => m._count.prices > 0)
    .map((m) => ({ ...m, recordCount: m._count.prices }))
}

async function getPriceRows(marketId?: string): Promise<VegRow[]> {
  const vegetables = await prisma.vegetable.findMany({
    select: { id: true, nameNe: true, nameEn: true, nameJa: true, unit: true },
    orderBy: { nameEn: 'asc' },
  })

  if (vegetables.length === 0) return []

  const whereFilter = marketId ? { marketId } : {}

  const latestDates = await prisma.priceRecord.findMany({
    distinct: ['date'],
    orderBy: { date: 'desc' },
    take: 2,
    select: { date: true },
    where: whereFilter,
  })

  if (latestDates.length === 0)
    return vegetables.map((v) => ({ ...v, avgPrice: null, minPrice: null, maxPrice: null, changePct: null, date: null }))

  const [latestDate, prevDate] = latestDates

  const [latestRecords, prevRecords] = await Promise.all([
    prisma.priceRecord.groupBy({
      by: ['vegetableId'],
      where: { date: latestDate.date, ...whereFilter },
      _avg: { avgPrice: true },
      _min: { minPrice: true },
      _max: { maxPrice: true },
    }),
    prevDate
      ? prisma.priceRecord.groupBy({
          by: ['vegetableId'],
          where: { date: prevDate.date, ...whereFilter },
          _avg: { avgPrice: true },
        })
      : Promise.resolve([]),
  ])

  const prevMap = new Map(prevRecords.map((r) => [r.vegetableId, r._avg.avgPrice]))
  const latestMap = new Map(
    latestRecords.map((r) => [
      r.vegetableId,
      { avg: r._avg.avgPrice, min: r._min.minPrice, max: r._max.maxPrice },
    ])
  )

  return vegetables.map((v) => {
    const latest = latestMap.get(v.id)
    const prevAvg = prevMap.get(v.id) ?? null
    const changePct =
      latest?.avg && prevAvg && prevAvg > 0
        ? ((latest.avg - prevAvg) / prevAvg) * 100
        : null

    return {
      ...v,
      avgPrice: latest?.avg ?? null,
      minPrice: latest?.min ?? null,
      maxPrice: latest?.max ?? null,
      changePct,
      date: latestDate.date.toISOString().split('T')[0],
    }
  })
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

  const [dict, rows, markets] = await Promise.all([
    getDictionary(locale),
    getPriceRows(selectedMarketId),
    getMarkets(),
  ])

  const getName = (row: VegRow) =>
    locale === 'ne' ? row.nameNe : locale === 'ja' ? row.nameJa : row.nameEn

  const withData = rows.filter((r) => r.avgPrice !== null)
  const gainers = [...withData]
    .filter((r) => (r.changePct ?? 0) > 0)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, 5)
  const losers = [...withData]
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
          {withData[0]?.date && (
            <p className="text-xs text-zinc-500 mt-1">
              {dict.home.updated}: {withData[0].date}
              {' · '}
              <span className="text-zinc-400 font-medium">{sourceInfo}</span>
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
              <h2 className="mb-3 text-sm font-semibold text-green-400 uppercase tracking-wider">
                {dict.home.topGainers}
              </h2>
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
              <h2 className="mb-3 text-sm font-semibold text-red-400 uppercase tracking-wider">
                {dict.home.topLosers}
              </h2>
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

          {/* Full table with market tabs */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
            {/* Market filter tabs */}
            <div className="px-4 pt-3 pb-0 border-b border-zinc-800">
              <div className="flex items-center justify-between gap-2 flex-wrap pb-3">
                <h2 className="text-sm font-semibold text-zinc-300">{dict.home.allVegetables}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {/* All Markets tab */}
                  <Link
                    href={`/${locale}`}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      !selectedMarketId
                        ? 'bg-zinc-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {locale === 'ne' ? 'सबै' : locale === 'ja' ? '全市場' : 'All'}
                  </Link>
                  {/* Per-market tabs */}
                  {markets.map((m) => (
                    <Link
                      key={m.id}
                      href={`/${locale}?marketId=${m.id}`}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        selectedMarketId === m.id
                          ? m.source === 'kalimati'
                            ? 'bg-green-600 text-white'
                            : 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {locale === 'ne' ? m.nameNe : m.nameEn}
                    </Link>
                  ))}
                </div>
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
                    <th className="px-4 py-2 text-right">{dict.price.min}</th>
                    <th className="px-4 py-2 text-right">{dict.price.max}</th>
                    <th className="px-4 py-2 text-right">{dict.price.avg}</th>
                    <th className="px-4 py-2 text-right">{dict.price.change}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
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
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-400">
                        {row.minPrice !== null ? row.minPrice.toFixed(0) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-400">
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
