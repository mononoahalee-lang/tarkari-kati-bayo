import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
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
  const validMonthlyAvgs = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const prices = monthlyMap.get(month) ?? []
    return prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null
  }).filter((v): v is number => v !== null)
  const overallAvg = validMonthlyAvgs.length > 0
    ? validMonthlyAvgs.reduce((a, b) => a + b, 0) / validMonthlyAvgs.length
    : 0

  const recentSummary = records.slice(-10).map((r) => ({
    date: r.date.toISOString().split('T')[0],
    market: r.market.nameEn,
    avg: r.avgPrice,
  }))

  const latestPrice = records.length > 0 ? records[records.length - 1].avgPrice : null
  const firstPrice = records.length > 0 ? records[0].avgPrice : null
  const priceTrend = latestPrice !== null && firstPrice !== null && firstPrice > 0
    ? (((latestPrice - firstPrice) / firstPrice) * 100).toFixed(1)
    : null

  const prompt = `You are a Nepal vegetable market analyst. Analyze price data for "${vegetable.nameEn}" (Nepali: ${vegetable.nameNe}).

Recent prices (NPR/kg): ${JSON.stringify(recentSummary)}
30-day trend: ${priceTrend !== null ? priceTrend + '%' : 'N/A'}
2-year average: ${overallAvg > 0 ? overallAvg.toFixed(2) + ' NPR/kg' : 'N/A'}

Respond ONLY with valid JSON (no markdown, no explanation):
{"ne":"<2句 Nepali commentary>","en":"<2句 English commentary>","ja":"<2句 Japanese commentary>","prediction":{"direction":"up|down|stable","confidence":"high|medium|low","reason":"<1 sentence>","estimatedRange":{"min":<number>,"max":<number>}}}`

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  })

  const text = response.text ?? ''
  let parsed
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON')
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 })
  }

  return NextResponse.json({
    vegetableId,
    vegetableNameEn: vegetable.nameEn,
    vegetableNameNe: vegetable.nameNe,
    vegetableNameJa: vegetable.nameJa,
    ...parsed,
    updatedAt: new Date().toISOString(),
  })
}
