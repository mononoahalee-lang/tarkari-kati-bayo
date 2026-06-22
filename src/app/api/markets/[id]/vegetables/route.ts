import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const latestDates = await prisma.priceRecord.findMany({
    where: { marketId: id },
    distinct: ['date'],
    orderBy: { date: 'desc' },
    take: 30,
    select: { date: true },
  })

  if (latestDates.length === 0) {
    return NextResponse.json({ vegetableIds: [], prices: {} })
  }

  const latestDate = latestDates[0].date
  const sevenDaysAgo = new Date(latestDate)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const prevDate = latestDates.find((d) => d.date <= sevenDaysAgo) ?? latestDates[1]
  const since365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)

  const [latestRecords, prevRecords, rangeRecords] = await Promise.all([
    prisma.priceRecord.groupBy({
      by: ['vegetableId'],
      where: { marketId: id, date: latestDate },
      _avg: { avgPrice: true },
    }),
    prevDate
      ? prisma.priceRecord.groupBy({
          by: ['vegetableId'],
          where: { marketId: id, date: prevDate.date },
          _avg: { avgPrice: true },
        })
      : Promise.resolve([]),
    // 52-week high/low for this market
    prisma.priceRecord.groupBy({
      by: ['vegetableId'],
      where: { marketId: id, date: { gte: since365 } },
      _min: { avgPrice: true },
      _max: { avgPrice: true },
    }),
  ])

  const prevMap = new Map(prevRecords.map((r) => [r.vegetableId, r._avg.avgPrice]))
  const rangeMap = new Map(rangeRecords.map((r) => [r.vegetableId, r]))

  const prices: Record<string, {
    avgPrice: number
    changePct: number | null
    min52w: number | null
    max52w: number | null
  }> = {}

  for (const r of latestRecords) {
    const avg = r._avg.avgPrice ?? 0
    const prev = prevMap.get(r.vegetableId) ?? null
    const range = rangeMap.get(r.vegetableId)
    const changePct = avg && prev && prev > 0 ? ((avg - prev) / prev) * 100 : null
    prices[r.vegetableId] = {
      avgPrice: avg,
      changePct,
      min52w: range?._min?.avgPrice ?? null,
      max52w: range?._max?.avgPrice ?? null,
    }
  }

  return NextResponse.json({ prices })
}
