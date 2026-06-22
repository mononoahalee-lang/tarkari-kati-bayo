import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const revalidate = 3600

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Find the latest date that has data for this market
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

  // All vegetable IDs in this market
  const allVegRecords = await prisma.priceRecord.findMany({
    where: { marketId: id },
    distinct: ['vegetableId'],
    select: { vegetableId: true },
  })
  const vegetableIds = allVegRecords.map((r) => r.vegetableId)

  // Latest prices for each vegetable in this market
  const [latestRecords, prevRecords] = await Promise.all([
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
  ])

  const prevMap = new Map(prevRecords.map((r) => [r.vegetableId, r._avg.avgPrice]))
  const prices: Record<string, { avgPrice: number; changePct: number | null }> = {}
  for (const r of latestRecords) {
    const avg = r._avg.avgPrice ?? 0
    const prev = prevMap.get(r.vegetableId) ?? null
    const changePct = avg && prev && prev > 0 ? ((avg - prev) / prev) * 100 : null
    prices[r.vegetableId] = { avgPrice: avg, changePct }
  }

  return NextResponse.json({ vegetableIds, prices })
}
