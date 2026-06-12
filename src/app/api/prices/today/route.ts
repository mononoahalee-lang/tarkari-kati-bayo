import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const marketId = searchParams.get('marketId') ?? undefined

  // Find most recent date with data
  const latest = await prisma.priceRecord.findFirst({
    where: marketId ? { marketId } : undefined,
    orderBy: { date: 'desc' },
    select: { date: true },
  })

  if (!latest) {
    return NextResponse.json([])
  }

  const latestDate = latest.date
  const prevDate = new Date(latestDate)
  prevDate.setDate(prevDate.getDate() - 1)

  const [todayRecords, yesterdayRecords] = await Promise.all([
    prisma.priceRecord.findMany({
      where: {
        date: latestDate,
        ...(marketId ? { marketId } : {}),
      },
      include: { vegetable: true, market: true },
      orderBy: { vegetable: { nameEn: 'asc' } },
    }),
    prisma.priceRecord.findMany({
      where: {
        date: prevDate,
        ...(marketId ? { marketId } : {}),
      },
      select: { vegetableId: true, marketId: true, avgPrice: true },
    }),
  ])

  const yesterdayMap = new Map(
    yesterdayRecords.map((r) => [`${r.vegetableId}:${r.marketId}`, r.avgPrice])
  )

  const result = todayRecords.map((r) => {
    const prevAvg = yesterdayMap.get(`${r.vegetableId}:${r.marketId}`) ?? null
    const change = prevAvg !== null ? r.avgPrice - prevAvg : null
    const changePct = prevAvg !== null && prevAvg > 0 ? (change! / prevAvg) * 100 : null

    return {
      id: r.id,
      vegetableId: r.vegetableId,
      marketId: r.marketId,
      date: r.date.toISOString().split('T')[0],
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      avgPrice: r.avgPrice,
      change,
      changePct,
      vegetable: {
        id: r.vegetable.id,
        nameNe: r.vegetable.nameNe,
        nameEn: r.vegetable.nameEn,
        nameJa: r.vegetable.nameJa,
        category: r.vegetable.category,
        unit: r.vegetable.unit,
      },
      market: {
        id: r.market.id,
        nameNe: r.market.nameNe,
        nameEn: r.market.nameEn,
        district: r.market.district,
      },
    }
  })

  return NextResponse.json(result)
}
