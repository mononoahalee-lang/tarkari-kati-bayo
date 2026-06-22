import { hasLocale } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ChartExplorer from '@/components/ChartExplorer'

export const revalidate = 3600 // re-fetch from DB at most once per hour

async function getVegetablesWithPrice() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [vegetables, latestPerVeg, prevPerVeg] = await Promise.all([
    prisma.vegetable.findMany({
      select: { id: true, nameNe: true, nameEn: true, nameJa: true, unit: true },
      orderBy: { nameEn: 'asc' },
    }),
    // Most recent price per vegetable (raw SQL for guaranteed DISTINCT ON semantics)
    prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number }>>`
      SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice"
      FROM "PriceRecord"
      ORDER BY "vegetableId", "date" DESC
    `,
    // Most recent price per vegetable that is at least 7 days old (for weekly change)
    prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number }>>`
      SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice"
      FROM "PriceRecord"
      WHERE "date" <= ${sevenDaysAgo}
      ORDER BY "vegetableId", "date" DESC
    `,
  ])

  const latestMap = new Map(latestPerVeg.map((r) => [r.vegetableId, Number(r.avgPrice)]))
  const prevMap = new Map(prevPerVeg.map((r) => [r.vegetableId, Number(r.avgPrice)]))

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
