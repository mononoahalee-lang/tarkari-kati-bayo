import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/gemini'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const vegetableId = searchParams.get('vegetableId')

  if (!vegetableId) {
    return NextResponse.json({ error: 'vegetableId required' }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  const vegetable = await prisma.vegetable.findUnique({ where: { id: vegetableId } })
  if (!vegetable) {
    return NextResponse.json({ error: 'Vegetable not found' }, { status: 404 })
  }

  const since = new Date()
  since.setDate(since.getDate() - 30)

  const records = await prisma.priceRecord.findMany({
    where: { vegetableId, date: { gte: since } },
    orderBy: { date: 'asc' },
    include: { market: { select: { nameEn: true } } },
  })

  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const seasonRecords = await prisma.priceRecord.findMany({
    where: { vegetableId, date: { gte: twoYearsAgo } },
    select: { date: true, avgPrice: true },
  })

  const monthlyMap = new Map<number, number[]>()
  for (const r of seasonRecords) {
    const month = r.date.getMonth() + 1
    if (!monthlyMap.has(month)) monthlyMap.set(month, [])
    monthlyMap.get(month)!.push(r.avgPrice)
  }
  const validAvgs = Array.from({ length: 12 }, (_, i) => {
    const prices = monthlyMap.get(i + 1) ?? []
    return prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null
  }).filter((v): v is number => v !== null)
  const overallAvg = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0

  const recentSummary = records.slice(-10).map((r) => ({
    date: r.date.toISOString().split('T')[0],
    avg: r.avgPrice,
  }))

  const latestPrice = records.at(-1)?.avgPrice ?? null
  const firstPrice = records.at(0)?.avgPrice ?? null
  const priceTrend =
    latestPrice && firstPrice && firstPrice > 0
      ? (((latestPrice - firstPrice) / firstPrice) * 100).toFixed(1)
      : null

  const prompt = `You are a Nepal vegetable market analyst. Analyze price data for "${vegetable.nameEn}" (Nepali: ${vegetable.nameNe}).

Recent prices (NPR/kg): ${JSON.stringify(recentSummary)}
30-day trend: ${priceTrend ? priceTrend + '%' : 'N/A'}
2-year average: ${overallAvg > 0 ? overallAvg.toFixed(2) + ' NPR/kg' : 'N/A'}
Current price: ${latestPrice ? latestPrice + ' NPR/kg' : 'N/A'}

Respond ONLY with valid JSON (no markdown code blocks, no extra text):
{"ne":"<2 sentences in Nepali about current price and outlook>","en":"<2 sentences in English about current price and outlook>","ja":"<2 sentences in Japanese about current price and outlook>","prediction":{"direction":"up","confidence":"medium","reason":"<1 sentence>","estimatedRange":{"min":0,"max":0}}}`

  try {
    const text = await generateText(prompt)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      vegetableId,
      vegetableNameEn: vegetable.nameEn,
      vegetableNameNe: vegetable.nameNe,
      vegetableNameJa: vegetable.nameJa,
      ...parsed,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
