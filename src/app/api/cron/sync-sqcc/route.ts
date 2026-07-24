import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { syncSqccVarieties } from '@/lib/sqcc'

export const runtime = 'nodejs'
export const maxDuration = 60

async function run(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startAt = Date.now()
  try {
    const result = await syncSqccVarieties()
    for (const lang of ['en', 'ja', 'ne']) {
      revalidatePath(`/${lang}/seed-registry`)
    }
    return NextResponse.json({ success: true, ...result, durationMs: Date.now() - startAt })
  } catch (err) {
    console.error('[cron/sync-sqcc]', err)
    return NextResponse.json({ success: false, error: String(err), durationMs: Date.now() - startAt }, { status: 500 })
  }
}

export const GET = run
export const POST = run
