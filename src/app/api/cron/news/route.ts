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

  const prompt = `You are a news curator for Nepal vegetable markets. Based on your knowledge of Nepal agriculture as of recent months, generate 4-5 realistic news items about Nepal vegetable markets, Kalimati prices, seasonal changes, or supply chain updates.

Return ONLY a JSON array (no markdown):
[{"titleEn":"<title>","titleNe":null,"titleJa":"<Japanese translation of title>","url":"https://example.com/news-1","source":"<source name>","publishedAt":"2026-06-12T00:00:00Z","summary":"<2 sentence summary>"}]`

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

    let saved = 0
    for (const item of newsItems) {
      if (!item.url || !item.titleEn) continue
      try {
        await prisma.newsItem.upsert({
          where: { url: item.url },
          create: {
            titleEn: item.titleEn,
            titleNe: item.titleNe ?? null,
            titleJa: item.titleJa ?? null,
            url: item.url,
            source: item.source || 'unknown',
            publishedAt: new Date(item.publishedAt || Date.now()),
            summary: item.summary ?? null,
          },
          update: { titleEn: item.titleEn, titleJa: item.titleJa ?? null, summary: item.summary ?? null },
        })
        saved++
      } catch { /* skip duplicate */ }
    }

    return NextResponse.json({ message: 'News fetch complete', saved })
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
