import { NextRequest, NextResponse } from 'next/server'
import { scrapeKalimati } from '@/lib/scraper-kalimati'

export const runtime = 'nodejs'
export const maxDuration = 60

async function run(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date')
  const targetDate = dateParam ? new Date(dateParam + 'T00:00:00Z') : undefined

  const startAt = Date.now()
  try {
    const count = await scrapeKalimati(targetDate)
    return NextResponse.json({ success: true, kalimati: count, durationMs: Date.now() - startAt })
  } catch (err) {
    console.error('[cron/scrape-kalimati]', err)
    return NextResponse.json({ success: false, error: String(err), durationMs: Date.now() - startAt }, { status: 500 })
  }
}

export const GET = run
export const POST = run
