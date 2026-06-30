import { hasLocale } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import CompareExplorer from '@/components/CompareExplorer'

export const revalidate = 43200 // cache for 12h; cron invalidates on-demand after scraping

async function getVegetables() {
  // Only list vegetables that have data in more than one market — otherwise
  // there is nothing to compare.
  const multiMarket = await prisma.$queryRaw<Array<{ vegetableId: string }>>`
    SELECT "vegetableId" FROM (
      SELECT "vegetableId", COUNT(DISTINCT "marketId") as market_count
      FROM "PriceRecord"
      GROUP BY "vegetableId"
    ) t WHERE market_count > 1
  `
  const eligibleIds = multiMarket.map((r) => r.vegetableId)

  return prisma.vegetable.findMany({
    where: { id: { in: eligibleIds } },
    select: { id: true, nameNe: true, nameEn: true, nameJa: true, unit: true },
    orderBy: { nameEn: 'asc' },
  })
}

export default async function ComparePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const locale = lang as Locale
  const vegetables = await getVegetables()

  return <CompareExplorer vegetables={vegetables} locale={locale} />
}
