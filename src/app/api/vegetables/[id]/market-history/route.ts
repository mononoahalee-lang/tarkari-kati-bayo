import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDateStr } from '@/lib/freshness'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const records = await prisma.priceRecord.findMany({
    where: { vegetableId: id },
    include: { market: true },
    orderBy: { date: 'asc' },
  })

  const result = records.map((r) => ({
    marketId: r.marketId,
    marketNameEn: r.market.nameEn,
    marketNameNe: r.market.nameNe,
    district: r.market.district,
    date: toDateStr(r.date),
    minPrice: r.minPrice,
    maxPrice: r.maxPrice,
    avgPrice: r.avgPrice,
  }))

  return NextResponse.json(result)
}
