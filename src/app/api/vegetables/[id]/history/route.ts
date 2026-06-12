import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 365)
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

  // Build candlestick data: open = prev avg, close = avg, high = max, low = min
  const candlesticks = records.map((r, i) => ({
    time: r.date.toISOString().split('T')[0],
    open: i > 0 ? records[i - 1].avgPrice : r.avgPrice,
    high: r.maxPrice,
    low: r.minPrice,
    close: r.avgPrice,
    marketEn: r.market.nameEn,
    marketNe: r.market.nameNe,
  }))

  // Stats
  const prices = records.map((r) => r.avgPrice)
  const stats =
    prices.length > 0
      ? {
          high: Math.max(...records.map((r) => r.maxPrice)),
          low: Math.min(...records.map((r) => r.minPrice)),
          avg: prices.reduce((a, b) => a + b, 0) / prices.length,
        }
      : null

  return NextResponse.json({ candlesticks, stats })
}
