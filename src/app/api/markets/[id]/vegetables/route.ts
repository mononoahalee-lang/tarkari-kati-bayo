import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const records = await prisma.priceRecord.findMany({
    where: { marketId: id },
    distinct: ['vegetableId'],
    select: { vegetableId: true },
  })

  return NextResponse.json({ vegetableIds: records.map((r) => r.vegetableId) })
}
