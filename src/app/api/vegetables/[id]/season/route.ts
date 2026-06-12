import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// Returns monthly avg prices for the past 2 years to detect high-price seasons
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const since = new Date()
  since.setFullYear(since.getFullYear() - 2)

  const records = await prisma.priceRecord.findMany({
    where: { vegetableId: id, date: { gte: since } },
    select: { date: true, avgPrice: true },
    orderBy: { date: 'asc' },
  })

  // Group by month number (1-12) and compute avg price
  const monthlyMap = new Map<number, number[]>()
  for (const r of records) {
    const month = r.date.getMonth() + 1
    if (!monthlyMap.has(month)) monthlyMap.set(month, [])
    monthlyMap.get(month)!.push(r.avgPrice)
  }

  const monthlyAvg = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const prices = monthlyMap.get(month) ?? []
    const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null
    return { month, avg }
  })

  // Determine high-season months: those with avg > overall avg * 1.1
  const validAvgs = monthlyAvg.filter((m) => m.avg !== null).map((m) => m.avg!)
  const overallAvg = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0
  const threshold = overallAvg * 1.1

  const result = monthlyAvg.map((m) => ({
    ...m,
    isHighSeason: m.avg !== null && m.avg > threshold,
  }))

  return NextResponse.json({ monthlyAvg: result, overallAvg, threshold })
}
