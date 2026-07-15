import { hasLocale, getDictionary } from '@/lib/i18n'
import type { Locale, CandlestickPoint } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import MarketCompare from '@/components/MarketCompare'
import PriceChartWrapper from '@/components/PriceChartWrapper'
import { toDateStr, isStaleDateStr } from '@/lib/freshness'

export const dynamic = 'force-dynamic'

type PeriodKey = '1W' | '1M' | '3M' | '1Y'
const PERIOD_DAYS: Record<PeriodKey, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }

const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES_NE = ['जन', 'फेब', 'मार्च', 'अप्र', 'मई', 'जुन', 'जुल', 'अग', 'सेप', 'अक्ट', 'नोभ', 'डिस']
const MONTH_NAMES_JA = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

async function getVegetableData(id: string, days: number) {
  const vegetable = await prisma.vegetable.findUnique({ where: { id } })
  if (!vegetable) return null

  const since = new Date()
  since.setDate(since.getDate() - days)

  const records = await prisma.priceRecord.findMany({
    where: { vegetableId: id, date: { gte: since } },
    orderBy: { date: 'asc' },
    select: { date: true, minPrice: true, maxPrice: true, avgPrice: true },
  })

  // Aggregate by date (avg across markets)
  const byDate = new Map<string, { min: number[]; max: number[]; avg: number[] }>()
  for (const r of records) {
    const key = r.date.toISOString().split('T')[0]
    if (!byDate.has(key)) byDate.set(key, { min: [], max: [], avg: [] })
    const entry = byDate.get(key)!
    entry.min.push(r.minPrice)
    entry.max.push(r.maxPrice)
    entry.avg.push(r.avgPrice)
  }

  // A day where only one market reported isn't actually a cross-market average —
  // it's that single market's price standing in for the whole country. For
  // thinly-reported vegetables this creates sharp single-day spikes/dips that
  // look like real price moves but really just reflect which market posted that
  // day, so they're dropped from this combined-markets view.
  const dateKeys = Array.from(byDate.entries())
    .filter(([, e]) => e.avg.length >= 2)
    .map(([key]) => key)
    .sort()
  const candlesticks: CandlestickPoint[] = dateKeys.map((key, i) => {
    const entry = byDate.get(key)!
    const avgPrice = entry.avg.reduce((a, b) => a + b, 0) / entry.avg.length
    const prevKey = dateKeys[i - 1]
    const prevEntry = prevKey ? byDate.get(prevKey) : null
    const prevAvg = prevEntry ? prevEntry.avg.reduce((a, b) => a + b, 0) / prevEntry.avg.length : avgPrice
    return {
      time: key,
      open: prevAvg,
      high: Math.max(...entry.max),
      low: Math.min(...entry.min),
      close: avgPrice,
    }
  })

  const allAvg = dateKeys.map((k) => {
    const e = byDate.get(k)!
    return e.avg.reduce((a, b) => a + b, 0) / e.avg.length
  })
  const allMin = records.map((r) => r.minPrice)
  const allMax = records.map((r) => r.maxPrice)

  // Absolute latest date across all records (regardless of cross-market filter)
  const absoluteLatestRecord = await prisma.priceRecord.findFirst({
    where: { vegetableId: id },
    orderBy: { date: 'desc' },
    select: { date: true },
  })
  const latestDate = absoluteLatestRecord ? toDateStr(absoluteLatestRecord.date) : null

  const stats =
    allAvg.length > 0
      ? {
          high: Math.max(...allMax),
          low: Math.min(...allMin),
          avg: allAvg.reduce((a, b) => a + b, 0) / allAvg.length,
          latest: allAvg[allAvg.length - 1],
          first: allAvg[0],
        }
      : null

  return { vegetable, candlesticks, stats, latestDate }
}

async function getMarketCompare(id: string) {
  const latest = await prisma.priceRecord.findFirst({
    where: { vegetableId: id },
    orderBy: { date: 'desc' },
    select: { date: true },
  })
  if (!latest) return []

  const records = await prisma.priceRecord.findMany({
    where: { vegetableId: id, date: latest.date },
    include: { market: { select: { nameEn: true, nameNe: true, district: true } } },
  })

  return records.map((r) => ({
    marketId: r.marketId,
    marketNameEn: r.market.nameEn,
    marketNameNe: r.market.nameNe,
    district: r.market.district,
    minPrice: r.minPrice,
    maxPrice: r.maxPrice,
    avgPrice: r.avgPrice,
  }))
}

async function getSeasonData(id: string) {
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const records = await prisma.priceRecord.findMany({
    where: { vegetableId: id, date: { gte: twoYearsAgo } },
    select: { date: true, avgPrice: true },
  })

  const monthlyMap = new Map<number, number[]>()
  for (const r of records) {
    const month = r.date.getMonth() + 1
    if (!monthlyMap.has(month)) monthlyMap.set(month, [])
    monthlyMap.get(month)!.push(r.avgPrice)
  }

  const monthlyAvg = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const prices = monthlyMap.get(month) ?? []
    const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null
    return { month, avg }
  })

  const validAvgs = monthlyAvg.filter((m) => m.avg !== null).map((m) => m.avg!)
  const overallAvg = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0
  const threshold = overallAvg * 1.1

  return monthlyAvg.map((m) => ({ ...m, isHighSeason: m.avg !== null && m.avg > threshold }))
}

async function getAIComment(id: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const res = await fetch(`${baseUrl}/api/ai/comment?vegetableId=${id}`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function VegetablePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; id: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const [{ lang, id }, { period: rawPeriod }] = await Promise.all([params, searchParams])

  if (!hasLocale(lang)) notFound()
  const locale = lang as Locale
  const period: PeriodKey = (rawPeriod as PeriodKey) && PERIOD_DAYS[rawPeriod as PeriodKey] ? (rawPeriod as PeriodKey) : '1M'

  const [dict, vegData, marketData, seasonData, aiComment] = await Promise.all([
    getDictionary(locale),
    getVegetableData(id, PERIOD_DAYS[period]),
    getMarketCompare(id),
    getSeasonData(id),
    getAIComment(id),
  ])

  if (!vegData) notFound()

  const { vegetable, candlesticks, stats, latestDate } = vegData
  const name = locale === 'ne' ? vegetable.nameNe : locale === 'ja' ? vegetable.nameJa : vegetable.nameEn
  const isStale = isStaleDateStr(latestDate)

  const changePct =
    stats && stats.first > 0 && !isStale ? (((stats.latest - stats.first) / stats.first) * 100).toFixed(2) : null

  const currentMonth = new Date().getMonth() + 1
  const currentSeasonInfo = seasonData.find((m) => m.month === currentMonth)
  const isCurrentHighSeason = currentSeasonInfo?.isHighSeason ?? false

  const monthNames = locale === 'ne' ? MONTH_NAMES_NE : locale === 'ja' ? MONTH_NAMES_JA : MONTH_NAMES_EN

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Back link */}
      <Link href={`/${locale}`} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        ← {dict.nav.home}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-100">{name}</h1>
            {isCurrentHighSeason && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
                🔥 {dict.detail.highSeason}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {locale === 'ne' ? vegetable.nameEn : vegetable.nameNe} · NPR/{vegetable.unit}
          </p>
        </div>
        {stats && (
          <div className="text-right">
            <p className={`text-2xl font-bold font-mono ${isStale ? 'text-zinc-400' : 'text-zinc-100'}`}>
              {stats.latest.toFixed(2)}
            </p>
            {isStale && latestDate && (
              <p className="text-xs text-amber-500 mt-0.5">
                ⚠ {locale === 'ja' ? 'データ最終更新' : locale === 'ne' ? 'अन्तिम डेटा' : 'Last data'}: {latestDate}
              </p>
            )}
            {changePct && (
              <p className={`text-sm font-medium font-mono ${parseFloat(changePct) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {parseFloat(changePct) >= 0 ? '+' : ''}{changePct}%
              </p>
            )}
          </div>
        )}
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {(Object.keys(PERIOD_DAYS) as PeriodKey[]).map((p) => (
          <Link
            key={p}
            href={`/${locale}/vegetables/${id}?period=${p}`}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              p === period ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {dict.detail.periods[p]}
          </Link>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-400 uppercase tracking-wider">{dict.detail.priceHistory}</h2>
        {candlesticks.length > 0 ? (
          <PriceChartWrapper data={candlesticks} height={320} />
        ) : (
          <div className="flex h-40 items-center justify-center text-zinc-500 text-sm">{dict.home.noData}</div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: dict.detail.stats.high52w, value: stats.high.toFixed(2) },
            { label: dict.detail.stats.low52w, value: stats.low.toFixed(2) },
            { label: dict.detail.stats.avgPrice, value: stats.avg.toFixed(2) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-center">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 font-mono text-lg font-semibold text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Season heatmap */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-400 uppercase tracking-wider">{dict.detail.highSeason}</h2>
        <p className="mb-3 text-xs text-zinc-500">{dict.detail.highSeasonDesc}</p>
        <div className="grid grid-cols-12 gap-1">
          {seasonData.map((m) => (
            <div key={m.month} className="text-center">
              <div
                className={`mx-auto mb-1 h-8 w-full rounded ${
                  m.month === currentMonth
                    ? m.isHighSeason ? 'bg-amber-500 ring-2 ring-amber-300' : 'bg-zinc-600 ring-2 ring-zinc-400'
                    : m.isHighSeason ? 'bg-amber-700' : 'bg-zinc-800'
                }`}
              />
              <p className="text-xs text-zinc-600">{monthNames[m.month - 1]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Market comparison */}
      {marketData.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-400 uppercase tracking-wider">{dict.detail.marketComparison}</h2>
          <MarketCompare data={marketData} locale={locale} />
        </div>
      )}

      {/* AI Comment */}
      {aiComment && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{dict.detail.aiComment}</h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {locale === 'ne' ? aiComment.ne : locale === 'ja' ? aiComment.ja : aiComment.en}
          </p>
          {aiComment.prediction && (
            <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-400 mb-1 uppercase tracking-wider">{dict.detail.pricePrediction}</p>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${aiComment.prediction.direction === 'up' ? 'text-green-400' : aiComment.prediction.direction === 'down' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {aiComment.prediction.direction === 'up' ? '↑' : aiComment.prediction.direction === 'down' ? '↓' : '→'}
                  {' '}{aiComment.prediction.direction}
                </span>
                <span className="text-xs text-zinc-500">({aiComment.prediction.confidence})</span>
                {aiComment.prediction.estimatedRange && (
                  <span className="text-xs font-mono text-zinc-400 ml-2">
                    NPR {aiComment.prediction.estimatedRange.min}–{aiComment.prediction.estimatedRange.max}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">{aiComment.prediction.reason}</p>
            </div>
          )}
          <p className="text-xs text-zinc-600">AI: claude-opus-4-8</p>
        </div>
      )}
    </div>
  )
}
