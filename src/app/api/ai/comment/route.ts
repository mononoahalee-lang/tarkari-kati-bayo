import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

const client = new Anthropic()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const vegetableId = searchParams.get('vegetableId')

  if (!vegetableId) {
    return NextResponse.json({ error: 'vegetableId required' }, { status: 400 })
  }

  const vegetable = await prisma.vegetable.findUnique({
    where: { id: vegetableId },
  })
  if (!vegetable) {
    return NextResponse.json({ error: 'Vegetable not found' }, { status: 404 })
  }

  // Fetch last 30 days price history (Kalimati or all markets)
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const records = await prisma.priceRecord.findMany({
    where: { vegetableId, date: { gte: since } },
    orderBy: { date: 'asc' },
    include: { market: { select: { nameEn: true } } },
  })

  // Monthly season data (past 2 years)
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
  const monthlyAvg = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const prices = monthlyMap.get(month) ?? []
    const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null
    return { month, avg }
  })
  const validAvgs = monthlyAvg.filter((m) => m.avg !== null).map((m) => m.avg!)
  const overallAvg = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0
  const threshold = overallAvg * 1.1
  const highSeasonMonths = monthlyAvg.filter((m) => m.avg !== null && m.avg > threshold).map((m) => m.month)

  // Summarize recent price data for prompt
  const recentSummary = records.slice(-10).map((r) => ({
    date: r.date.toISOString().split('T')[0],
    market: r.market.nameEn,
    min: r.minPrice,
    max: r.maxPrice,
    avg: r.avgPrice,
  }))

  const latestPrice = records.length > 0 ? records[records.length - 1].avgPrice : null
  const firstPrice = records.length > 0 ? records[0].avgPrice : null
  const priceTrend =
    latestPrice !== null && firstPrice !== null && firstPrice > 0
      ? (((latestPrice - firstPrice) / firstPrice) * 100).toFixed(1)
      : null

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const highSeasonStr =
    highSeasonMonths.length > 0 ? highSeasonMonths.map((m) => monthNames[m - 1]).join(', ') : 'none identified'

  const prompt = `You are a Nepal vegetable market analyst. Analyze the price data for "${vegetable.nameEn}" (Nepali: ${vegetable.nameNe}) and provide insights.

Recent 30-day price data (NPR/kg):
${JSON.stringify(recentSummary, null, 2)}

Statistics:
- Current average price: ${latestPrice !== null ? `${latestPrice} NPR/kg` : 'No data'}
- 30-day price change: ${priceTrend !== null ? `${priceTrend}%` : 'No data'}
- Overall 2-year average: ${overallAvg > 0 ? `${overallAvg.toFixed(2)} NPR/kg` : 'No data'}
- Historically high-price months: ${highSeasonStr}

Provide a response in the following JSON format ONLY (no other text):
{
  "ne": "<2-3 sentence commentary in Nepali about current price situation and outlook>",
  "en": "<2-3 sentence commentary in English about current price situation and outlook>",
  "ja": "<2-3 sentence commentary in Japanese about current price situation and outlook>",
  "prediction": {
    "direction": "up" | "down" | "stable",
    "confidence": "high" | "medium" | "low",
    "reason": "<1 sentence English reason for prediction>",
    "estimatedRange": { "min": <number>, "max": <number> }
  }
}`

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
  })

  // Extract text content from response (skip thinking blocks)
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'No text response from AI' }, { status: 500 })
  }

  let parsed: {
    ne: string
    en: string
    ja: string
    prediction: {
      direction: string
      confidence: string
      reason: string
      estimatedRange: { min: number; max: number }
    }
  }

  try {
    // Extract JSON from the response (may be wrapped in markdown code blocks)
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: textBlock.text }, { status: 500 })
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
