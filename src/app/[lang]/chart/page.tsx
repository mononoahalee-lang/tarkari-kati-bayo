import { hasLocale } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ChartExplorer from '@/components/ChartExplorer'
import { toDateStr, isStaleDateStr } from '@/lib/freshness'

export const revalidate = 43200 // cache for 12h; cron invalidates on-demand after scraping

async function getVegetablesWithPrice() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const since365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)

  const [vegetables, latestPerVeg, prevPerVeg, rangePerVeg] = await Promise.all([
    prisma.vegetable.findMany({
      select: { id: true, nameNe: true, nameEn: true, nameJa: true, unit: true },
      orderBy: { nameEn: 'asc' },
    }),
    prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number; date: Date }>>`
      SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice", "date"
      FROM "PriceRecord"
      ORDER BY "vegetableId", "date" DESC
    `,
    prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number }>>`
      SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice"
      FROM "PriceRecord"
      WHERE "date" <= ${sevenDaysAgo}
      ORDER BY "vegetableId", "date" DESC
    `,
    // 52-week high/low across all markets
    prisma.priceRecord.groupBy({
      by: ['vegetableId'],
      where: { date: { gte: since365 } },
      _min: { avgPrice: true },
      _max: { avgPrice: true },
    }),
  ])

  const latestMap = new Map(
    latestPerVeg.map((r) => [r.vegetableId, { avgPrice: Number(r.avgPrice), date: toDateStr(r.date) }])
  )
  const prevMap = new Map(prevPerVeg.map((r) => [r.vegetableId, Number(r.avgPrice)]))
  const rangeMap = new Map(rangePerVeg.map((r) => [r.vegetableId, r]))

  return vegetables
    .filter((v) => rangeMap.has(v.id)) // exclude vegetables with no data in the last 365 days
    .map((v) => {
      const latest = latestMap.get(v.id) ?? null
      const isStale = isStaleDateStr(latest?.date ?? null)
      const avg = latest?.avgPrice ?? null  // show last known price even if stale; UI marks it as outdated
      const prev = prevMap.get(v.id) ?? null
      const range = rangeMap.get(v.id)
      const changePct = !isStale && avg !== null && prev !== null && prev > 0 ? ((avg - prev) / prev) * 100 : null
      return {
        ...v,
        avgPrice: avg,
        changePct,
        min52w: range?._min?.avgPrice ?? null,
        max52w: range?._max?.avgPrice ?? null,
        isStale,
        lastDate: latest?.date ?? null,
      }
    })
}

async function getMarkets() {
  const [markets, latestPerMarket] = await Promise.all([
    prisma.market.findMany({
      select: { id: true, nameEn: true, nameNe: true, district: true },
      orderBy: { nameEn: 'asc' },
    }),
    prisma.$queryRaw<Array<{ marketId: string; latest: Date }>>`
      SELECT "marketId", MAX(date) as latest FROM "PriceRecord" GROUP BY "marketId"
    `,
  ])
  const latestMap = new Map(latestPerMarket.map((r) => [r.marketId, toDateStr(r.latest)]))
  return markets.map((m) => {
    const latestDate = latestMap.get(m.id) ?? null
    return { ...m, isStale: isStaleDateStr(latestDate) }
  })
}

export default async function ChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams?: Promise<{ marketId?: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const locale = lang as Locale
  const { marketId } = (await searchParams) ?? {}
  const [vegetables, markets] = await Promise.all([getVegetablesWithPrice(), getMarkets()])

  return (
    <ChartExplorer
      vegetables={vegetables}
      markets={markets}
      locale={locale}
      initialMarketId={marketId}
    />
  )
}
