import { NextRequest, NextResponse } from 'next/server'
import { scrapeKalimati } from '@/lib/scraper-kalimati'
import { scrapeAmpis, describeZeroRowMarkets } from '@/lib/scraper-ampis'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

async function runScrape(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date') ?? (await request.json().catch(() => ({}))).date as string | undefined

  const targetDate = dateParam ? new Date(dateParam + 'T00:00:00Z') : undefined

  const startAt = Date.now()

  const [kalimatiResult, ampisResult] = await Promise.allSettled([
    scrapeKalimati(targetDate),
    scrapeAmpis(),
  ])

  const kalimatiCount = kalimatiResult.status === 'fulfilled' ? kalimatiResult.value : 0
  const ampisCount = ampisResult.status === 'fulfilled' ? ampisResult.value.total : 0

  const today = targetDate ?? new Date()
  today.setHours(0, 0, 0, 0)

  if (ampisResult.status === 'rejected') {
    await prisma.scrapeLog.create({
      data: { source: 'ampis', targetDate: today, itemsCount: 0, success: false, message: String(ampisResult.reason).slice(0, 200) },
    })
  } else {
    const message = describeZeroRowMarkets(ampisResult.value.markets)
    await prisma.scrapeLog.create({
      data: { source: 'ampis', targetDate: today, itemsCount: ampisCount, success: true, message },
    })
  }

  return NextResponse.json({
    success: true,
    kalimati: kalimatiCount,
    ampis: ampisCount,
    total: kalimatiCount + ampisCount,
    durationMs: Date.now() - startAt,
  })
}

export async function GET(request: NextRequest) {
  return runScrape(request)
}

export async function POST(request: NextRequest) {
  return runScrape(request)
}
