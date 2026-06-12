import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  const prompt = `Search the web for recent news (last 7 days) about Nepal vegetable markets, Kalimati market prices, vegetable supply/demand in Nepal, and weather affecting Nepal agriculture.

Return ONLY a JSON array (no markdown), with 3-5 items:
[{"titleEn":"<title>","titleNe":null,"titleJa":"<Japanese translation>","url":"<url>","source":"<source name>","publishedAt":"<ISO date>","summary":"<2 sentence English summary>"}]`

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
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    })
    const text = response.text ?? ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) newsItems = JSON.parse(jsonMatch[0])
  } catch (err) {
    return NextResponse.json({ error: 'Gemini news fetch failed', details: String(err) }, { status: 500 })
  }

  if (!Array.isArray(newsItems) || newsItems.length === 0) {
    return NextResponse.json({ message: 'No news items found', saved: 0 })
  }

  let saved = 0
  let skipped = 0

  for (const item of newsItems) {
    if (!item.url || !item.titleEn) { skipped++; continue }
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
    } catch { skipped++ }
  }

  return NextResponse.json({ message: 'News fetch complete', saved, skipped })
}
