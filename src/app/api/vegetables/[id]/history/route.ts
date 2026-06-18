import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 1095)
  const marketId = searchParams.get('marketId') ?? undefined

  const since = new Date()
  since.setDate(since.getDate() - days)

  const records = await prisma.priceRecord.findMany({
    where: {
      vegetableId: id,
      date: { gte: since },
      ...(marketId ? { marketId } : {}),
    },
    orderBy: { date: 'asc' },
    include: { market: { select: { nameEn: true, nameNe: true } } },
  })

  // Group by date to ensure unique timestamps for TradingView (multiple markets may report same date)
  type DateAgg = { min: number; max: number; avgSum: number; count: number; marketEn: string; marketNe: string }
  const dateMap = new Map<string, DateAgg>()
  for (const r of records) {
    const dateStr = r.date.toISOString().split('T')[0]
    const existing = dateMap.get(dateStr)
    if (existing) {
      existing.min = Math.min(existing.min, r.minPrice)
      existing.max = Math.max(existing.max, r.maxPrice)
      existing.avgSum += r.avgPrice
      existing.count++
    } else {
      dateMap.set(dateStr, {
        min: r.minPrice,
        max: r.maxPrice,
        avgSum: r.avgPrice,
        count: 1,
        marketEn: r.market.nameEn,
        marketNe: r.market.nameNe,
      })
    }
  }

  const sorted = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  const candlesticks = sorted.map(([date, d], i) => {
    const avg = d.avgSum / d.count
    const prevAvg = i > 0 ? sorted[i - 1][1].avgSum / sorted[i - 1][1].count : avg
    return {
      time: date,
      open: prevAvg,
      high: d.max,
      low: d.min,
      close: avg,
      marketEn: d.marketEn,
      marketNe: d.marketNe,
    }
  })

  // Stats
  const stats =
    sorted.length > 0
      ? {
          high: Math.max(...sorted.map(([, d]) => d.max)),
          low: Math.min(...sorted.map(([, d]) => d.min)),
          avg: sorted.reduce((a, [, d]) => a + d.avgSum / d.count, 0) / sorted.length,
        }
      : null

  return NextResponse.json({ candlesticks, stats })
}
