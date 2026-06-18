import { NextRequest, NextResponse } from 'next/server'
import { scrapeKalimati } from '@/lib/scraper-kalimati'
import { scrapeAmpis } from '@/lib/scraper-ampis'

export const runtime = 'nodejs'
export const maxDuration = 300

async function runScrape(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [kalimatiCount, ampisCount] = await Promise.allSettled([
      scrapeKalimati(),
      scrapeAmpis(),
    ]).then((results) =>
      results.map((r) => (r.status === 'fulfilled' ? r.value : 0))
    )

    return NextResponse.json({
      success: true,
      kalimati: kalimatiCount,
      ampis: ampisCount,
      total: (kalimatiCount as number) + (ampisCount as number),
    })
  } catch (err) {
    console.error('Scrape error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Vercel Cron sends GET — must handle GET in production
export async function GET(request: NextRequest) {
  return runScrape(request)
}

export async function POST(request: NextRequest) {
  return runScrape(request)
}
