import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

  const result = records.map((r) => ({
    marketId: r.marketId,
    marketNameEn: r.market.nameEn,
    marketNameNe: r.market.nameNe,
    district: r.market.district,
    minPrice: r.minPrice,
    maxPrice: r.maxPrice,
    avgPrice: r.avgPrice,
    date: r.date.toISOString().split('T')[0],
  }))

  return NextResponse.json(result)
}
