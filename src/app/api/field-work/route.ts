import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const observations = await prisma.fieldObservation.findMany({
    orderBy: { date: 'desc' },
    include: {
      vegetable: { select: { nameEn: true, nameNe: true, nameJa: true, unit: true } },
      market: { select: { nameEn: true, nameNe: true, district: true } },
    },
  })

  return NextResponse.json(
    observations.map((o) => ({
      id: o.id,
      date: o.date.toISOString().split('T')[0],
      storeName: o.storeName,
      location: o.location,
      vegetableId: o.vegetableId,
      vegetableEn: o.vegetable.nameEn,
      vegetableNe: o.vegetable.nameNe,
      vegetableJa: o.vegetable.nameJa,
      unit: o.vegetable.unit,
      marketId: o.marketId,
      marketEn: o.market?.nameEn ?? null,
      marketNe: o.market?.nameNe ?? null,
      observedPrice: o.observedPrice,
      marketPrice: o.marketPrice,
      note: o.note,
      createdAt: o.createdAt.toISOString(),
    }))
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, storeName, location, marketId, vegetableId, observedPrice, note } = body

  if (!date || !storeName || !vegetableId || observedPrice == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const dateObj = new Date(date + 'T00:00:00Z')

  // Look up official market price on that date (or nearest available date within 7 days)
  let marketPrice: number | null = null
  if (marketId) {
    const record = await prisma.priceRecord.findFirst({
      where: {
        vegetableId,
        marketId,
        date: { lte: dateObj, gte: new Date(dateObj.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: 'desc' },
      select: { avgPrice: true },
    })
    marketPrice = record?.avgPrice ?? null
  }

  const observation = await prisma.fieldObservation.create({
    data: {
      date: dateObj,
      storeName,
      location,
      marketId: marketId || null,
      vegetableId,
      observedPrice: Number(observedPrice),
      marketPrice,
      note: note || null,
    },
    include: {
      vegetable: { select: { nameEn: true, nameNe: true, nameJa: true, unit: true } },
      market: { select: { nameEn: true, nameNe: true, district: true } },
    },
  })

  return NextResponse.json({
    id: observation.id,
    date: observation.date.toISOString().split('T')[0],
    storeName: observation.storeName,
    location: observation.location,
    vegetableId: observation.vegetableId,
    vegetableEn: observation.vegetable.nameEn,
    vegetableNe: observation.vegetable.nameNe,
    vegetableJa: observation.vegetable.nameJa,
    unit: observation.vegetable.unit,
    marketId: observation.marketId,
    marketEn: observation.market?.nameEn ?? null,
    marketNe: observation.market?.nameNe ?? null,
    observedPrice: observation.observedPrice,
    marketPrice: observation.marketPrice,
    note: observation.note,
    createdAt: observation.createdAt.toISOString(),
  }, { status: 201 })
}
