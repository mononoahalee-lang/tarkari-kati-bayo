import { hasLocale } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import FieldWork from '@/components/FieldWork'

export const dynamic = 'force-dynamic'

export default async function FieldWorkPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const locale = lang as Locale

  const since365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)

  const [vegetables, markets] = await Promise.all([
    prisma.vegetable.findMany({
      where: { prices: { some: { date: { gte: since365 } } } },
      select: { id: true, nameEn: true, nameNe: true, nameJa: true, unit: true },
      orderBy: { nameEn: 'asc' },
    }),
    prisma.market.findMany({
      select: { id: true, nameEn: true, nameNe: true, district: true },
      orderBy: { nameEn: 'asc' },
    }),
  ])

  return <FieldWork vegetables={vegetables} markets={markets} locale={locale} />
}
