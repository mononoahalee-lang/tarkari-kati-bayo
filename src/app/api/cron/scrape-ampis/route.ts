import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { scrapeAmpis, describeZeroRowMarkets } from '@/lib/scraper-ampis'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

async function run(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startAt = Date.now()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  try {
    const result = await scrapeAmpis()
    const message = describeZeroRowMarkets(result.markets)
    await prisma.scrapeLog.create({
      data: { source: 'ampis', targetDate: today, itemsCount: result.total, success: true, message },
    })
    for (const lang of ['en', 'ne', 'ja']) {
      revalidatePath(`/${lang}`)
      revalidatePath(`/${lang}/chart`)
    }
    return NextResponse.json({ success: true, ampis: result.total, markets: result.markets, durationMs: Date.now() - startAt })
  } catch (err) {
    console.error('[cron/scrape-ampis]', err)
    await prisma.scrapeLog.create({
      data: { source: 'ampis', targetDate: today, itemsCount: 0, success: false, message: String(err).slice(0, 200) },
    }).catch(() => {})
    return NextResponse.json({ success: false, error: String(err), durationMs: Date.now() - startAt }, { status: 500 })
  }
}

export const GET = run
export const POST = run
