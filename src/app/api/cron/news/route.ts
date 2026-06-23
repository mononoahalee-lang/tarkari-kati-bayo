import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/gemini'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

async function runNews(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  const prompt = `You are a news curator for Nepal vegetable markets. Today is ${today}.

Generate 5 realistic news items about Nepal vegetable markets published today. Topics: Kalimati prices, seasonal supply changes, weather impact on crops, market trends, export/import updates.

Each URL MUST include today's date (${today}) to be unique. Use this format:
"https://example.com/nepal-market/${today}/item-1"  (change item-1 to item-2, item-3, item-4, item-5)

Return ONLY a valid JSON array (no markdown):
[{"titleEn":"...","titleNe":null,"titleJa":"...","url":"https://example.com/nepal-market/${today}/item-1","source":"Kalimati Market Office","publishedAt":"${today}T06:00:00Z","summary":"2 sentence summary in English."}]`

  try {
    const text = await generateText(prompt)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')
    const newsItems: Array<{
      titleEn: string
      titleNe: string | null
      titleJa: string | null
      url: string
      source: string
      publishedAt: string
      summary: string | null
    }> = JSON.parse(jsonMatch[0])

    // Delete news older than 30 days to keep feed fresh
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await prisma.newsItem.deleteMany({ where: { publishedAt: { lt: cutoff } } })

    let saved = 0
    for (const item of newsItems) {
      if (!item.url || !item.titleEn) continue
      // Ensure URL contains today's date (guard against AI ignoring instructions)
      const uniqueUrl = item.url.includes(today)
        ? item.url
        : `https://example.com/nepal-market/${today}/${saved + 1}`
      try {
        await prisma.newsItem.upsert({
          where: { url: uniqueUrl },
          create: {
            titleEn: item.titleEn,
            titleNe: item.titleNe ?? null,
            titleJa: item.titleJa ?? null,
            url: uniqueUrl,
            source: item.source || 'Nepal Market News',
            publishedAt: new Date(today + 'T00:00:00Z'),
            summary: item.summary ?? null,
          },
          update: {
            titleEn: item.titleEn,
            titleJa: item.titleJa ?? null,
            summary: item.summary ?? null,
            publishedAt: new Date(today + 'T00:00:00Z'),
          },
        })
        saved++
      } catch { /* skip */ }
    }

    return NextResponse.json({ message: 'News updated', date: today, saved })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return runNews(request)
}

export async function POST(request: NextRequest) {
  return runNews(request)
}
