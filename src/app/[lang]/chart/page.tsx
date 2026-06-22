import { hasLocale } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ChartExplorer from '@/components/ChartExplorer'

export const dynamic = 'force-dynamic'

async function getVegetablesWithPrice() {
  const vegetables = await prisma.vegetable.findMany({
    select: { id: true, nameNe: true, nameEn: true, nameJa: true, unit: true },
    orderBy: { nameEn: 'asc' },
  })

  // Get the most recent price per vegetable individually (handles different scrape dates per market)
  const [latestPerVeg, prevPerVeg] = await Promise.all([
    prisma.priceRecord.findMany({
      distinct: ['vegetableId'],
      orderBy: [{ vegetableId: 'asc' }, { date: 'desc' }],
      select: { vegetableId: true, avgPrice: true },
    }),
    // Most recent price that is at least 7 days before today for comparison
    prisma.priceRecord.findMany({
      distinct: ['vegetableId'],
      orderBy: [{ vegetableId: 'asc' }, { date: 'desc' }],
      where: { date: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { vegetableId: true, avgPrice: true },
    }),
  ])

  const latestMap = new Map(latestPerVeg.map((r) => [r.vegetableId, r.avgPrice]))
  const prevMap = new Map(prevPerVeg.map((r) => [r.vegetableId, r.avgPrice]))

  return vegetables.map((v) => {
    const avg = latestMap.get(v.id) ?? null
    const prev = prevMap.get(v.id) ?? null
    const changePct = avg !== null && prev !== null && prev > 0 ? ((avg - prev) / prev) * 100 : null
    return { ...v, avgPrice: avg, changePct }
  })
}

async function getMarkets() {
  return prisma.market.findMany({
    select: { id: true, nameEn: true, nameNe: true, district: true },
    orderBy: { nameEn: 'asc' },
  })
}

export default async function ChartPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const locale = lang as Locale
  const [vegetables, markets] = await Promise.all([getVegetablesWithPrice(), getMarkets()])

  return (
    <ChartExplorer vegetables={vegetables} markets={markets} locale={locale} />
  )
}
