import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDateStr, isStaleDateStr } from '@/lib/freshness'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const latest = await prisma.priceRecord.findFirst({
    where: { vegetableId: id },
    orderBy: { date: 'desc' },
    select: { date: true },
  })

  if (!latest) return NextResponse.json([])

  const records = await prisma.priceRecord.findMany({
    where: { vegetableId: id, date: latest.date },
    include: { market: true },
  })

  // All records share the same (most recent overall) date for this vegetable,
  // so a single staleness check applies to the whole comparison set — if every
  // market is stuck on the same old date, the client can flag it explicitly.
  const dateStr = toDateStr(latest.date)
  const isStale = isStaleDateStr(dateStr)

  const result = records.map((r) => ({
    marketId: r.marketId,
    marketNameEn: r.market.nameEn,
    marketNameNe: r.market.nameNe,
    district: r.market.district,
    minPrice: r.minPrice,
    maxPrice: r.maxPrice,
    avgPrice: r.avgPrice,
    date: dateStr,
    isStale,
  }))

  return NextResponse.json(result)
}
