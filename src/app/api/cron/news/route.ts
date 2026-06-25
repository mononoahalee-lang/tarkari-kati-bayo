import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/gemini'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

// Real Nepal market/agriculture reference URLs
const REFERENCE_SOURCES = [
  { url: 'https://kalimatimarket.gov.np/price', source: 'Kalimati Market Office' },
  { url: 'https://ampis.gov.np', source: 'AMPIS Nepal' },
  { url: 'https://moad.gov.np', source: 'Ministry of Agriculture Nepal' },
  { url: 'https://ekantipur.com/news/business', source: 'Kantipur Daily' },
  { url: 'https://thehimalayantimes.com/business', source: 'The Himalayan Times' },
  { url: 'https://myrepublica.nagariknetwork.com/category/business/', source: 'My Republica' },
  { url: 'https://www.onlinekhabar.com/content/agriculture', source: 'Online Khabar' },
]

async function runNews(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  const today = new Date().toISOString().split('T')[0]

  const sourceList = REFERENCE_SOURCES.map((s, i) => `${i + 1}. ${s.url} (${s.source})`).join('\n')

  const prompt = `You are a news curator for Nepal vegetable markets. Today is ${today}.

Generate 5 realistic news items about Nepal vegetable markets published today.
Topics: Kalimati prices, seasonal supply changes, weather impact on crops, market trends, export/import updates.

For each news item, pick the MOST RELEVANT reference URL from this list:
${sourceList}

Use the exact URL from the list above (do NOT modify it). Append ?ref=${today}-N (where N is 1-5) to make it unique.

Return ONLY a valid JSON array (no markdown):
[{"titleEn":"...","titleNe":"...","titleJa":"...","url":"<exact url from list above>?ref=${today}-1","source":"<source name from list>","publishedAt":"${today}T06:00:00Z","summary":"2 sentence summary in English."}]`

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

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await prisma.newsItem.deleteMany({ where: { publishedAt: { lt: cutoff } } })

    const validBaseDomains = REFERENCE_SOURCES.map((s) => new URL(s.url).hostname)

    let saved = 0
    for (let i = 0; i < newsItems.length; i++) {
      const item = newsItems[i]
      if (!item.titleEn) continue

      // Validate URL is from our allowed sources; fallback to Kalimati if AI hallucinated a URL
      let finalUrl = item.url ?? ''
      try {
        const hostname = new URL(finalUrl).hostname
        if (!validBaseDomains.includes(hostname)) {
          finalUrl = `${REFERENCE_SOURCES[0].url}?ref=${today}-${i + 1}`
        } else if (!finalUrl.includes('ref=')) {
          finalUrl = `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}ref=${today}-${i + 1}`
        }
      } catch {
        finalUrl = `${REFERENCE_SOURCES[0].url}?ref=${today}-${i + 1}`
      }

      try {
        await prisma.newsItem.upsert({
          where: { url: finalUrl },
          create: {
            titleEn: item.titleEn,
            titleNe: item.titleNe ?? null,
            titleJa: item.titleJa ?? null,
            url: finalUrl,
            source: item.source || 'Nepal Market News',
            publishedAt: new Date(today + 'T00:00:00Z'),
            summary: item.summary ?? null,
          },
          update: {
            titleEn: item.titleEn,
            titleNe: item.titleNe ?? null,
            titleJa: item.titleJa ?? null,
            summary: item.summary ?? null,
            publishedAt: new Date(today + 'T00:00:00Z'),
          },
        })
        saved++
      } catch { /* skip duplicate */ }
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
