import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 120

const client = new Anthropic()

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prompt = `Search for recent news (last 7 days) about Nepal vegetable markets, prices, and agricultural conditions. Focus on:
1. Kalimati market price updates
2. Nepal vegetable supply and demand changes
3. Weather affecting vegetable production in Nepal
4. Government policies about vegetable markets in Nepal
5. AMPIS or other Nepal agricultural market news

For each news item found, provide the response as a JSON array with this structure:
[
  {
    "titleEn": "<English title>",
    "titleNe": "<Nepali title if available, otherwise null>",
    "titleJa": "<Japanese translation of title>",
    "url": "<article URL>",
    "source": "<source name>",
    "publishedAt": "<ISO date string>",
    "summary": "<2-3 sentence English summary>"
  }
]

Find at least 3-5 relevant news items. Return ONLY the JSON array, no other text.`

  let newsItems: Array<{
    titleEn: string
    titleNe: string | null
    titleJa: string | null
    url: string
    source: string
    publishedAt: string
    summary: string | null
  }> = []

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    })

    // Find text content block (skip thinking and tool use blocks)
    const textBlock = response.content.find((b) => b.type === 'text')
    if (textBlock && textBlock.type === 'text') {
      const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        newsItems = JSON.parse(jsonMatch[0])
      }
    }
  } catch (err) {
    console.error('Claude news fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch news from AI', details: String(err) }, { status: 500 })
  }

  if (!Array.isArray(newsItems) || newsItems.length === 0) {
    return NextResponse.json({ message: 'No news items found', saved: 0 })
  }

  // Upsert news items into DB
  let saved = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of newsItems) {
    if (!item.url || !item.titleEn) {
      skipped++
      continue
    }

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
        update: {
          titleEn: item.titleEn,
          titleNe: item.titleNe ?? null,
          titleJa: item.titleJa ?? null,
          summary: item.summary ?? null,
        },
      })
      saved++
    } catch (err) {
      errors.push(`${item.url}: ${String(err)}`)
      skipped++
    }
  }

  return NextResponse.json({
    message: 'News fetch complete',
    saved,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  })
}
