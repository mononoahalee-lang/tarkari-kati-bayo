import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { date, storeName, location, marketId, vegetableId, observedPrice, note } = await req.json()

  const dateObj = new Date(date + 'T00:00:00Z')
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

  const updated = await prisma.fieldObservation.update({
    where: { id },
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
    id: updated.id,
    date: updated.date.toISOString().split('T')[0],
    storeName: updated.storeName,
    location: updated.location,
    vegetableId: updated.vegetableId,
    vegetableEn: updated.vegetable.nameEn,
    vegetableNe: updated.vegetable.nameNe,
    vegetableJa: updated.vegetable.nameJa,
    unit: updated.vegetable.unit,
    marketId: updated.marketId,
    marketEn: updated.market?.nameEn ?? null,
    marketNe: updated.market?.nameNe ?? null,
    observedPrice: updated.observedPrice,
    marketPrice: updated.marketPrice,
    note: updated.note,
    createdAt: updated.createdAt.toISOString(),
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.fieldObservation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
