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

  const latestDates = await prisma.priceRecord.findMany({
    distinct: ['date'],
    orderBy: { date: 'desc' },
    take: 2,
    select: { date: true },
  })

  if (latestDates.length === 0) {
    return vegetables.map((v) => ({ ...v, avgPrice: null, changePct: null }))
  }

  const [latestDate, prevDate] = latestDates

  const [latestRecords, prevRecords] = await Promise.all([
    prisma.priceRecord.groupBy({
      by: ['vegetableId'],
      where: { date: latestDate.date },
      _avg: { avgPrice: true },
    }),
    prevDate
      ? prisma.priceRecord.groupBy({
          by: ['vegetableId'],
          where: { date: prevDate.date },
          _avg: { avgPrice: true },
        })
      : Promise.resolve([]),
  ])

  const latestMap = new Map(latestRecords.map((r) => [r.vegetableId, r._avg.avgPrice]))
  const prevMap = new Map(prevRecords.map((r) => [r.vegetableId, r._avg.avgPrice]))

  return vegetables.map((v) => {
    const avg = latestMap.get(v.id) ?? null
    const prev = prevMap.get(v.id) ?? null
    const changePct = avg !== null && prev !== null && prev > 0 ? ((avg - prev) / prev) * 100 : null
    return { ...v, avgPrice: avg, changePct }
  })
}

export default async function ChartPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const locale = lang as Locale
  const vegetables = await getVegetablesWithPrice()

  return (
    <ChartExplorer vegetables={vegetables} locale={locale} />
  )
}
