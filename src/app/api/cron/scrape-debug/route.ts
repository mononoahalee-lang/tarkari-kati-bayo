import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = 'https://kalimatimarket.gov.np/price'
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)' },
      signal: AbortSignal.timeout(30000),
    })
    const html = await res.text()
    const $ = cheerio.load(html)

    const tables = $('table').length
    const tbodyRows = $('table tbody tr').length
    const allRows = $('tr').length

    // Sample first 3 rows
    const sampleRows: string[][] = []
    $('table tbody tr').slice(0, 3).each((_, tr) => {
      const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get()
      sampleRows.push(cells)
    })

    // Find any element that might contain prices
    const priceHints: string[] = []
    $('td').slice(0, 30).each((_, td) => {
      const t = $(td).text().trim()
      if (t.match(/[०-९0-9]/) && t.length < 20) priceHints.push(t)
    })

    return NextResponse.json({
      status: res.status,
      htmlLength: html.length,
      tables,
      tbodyRows,
      allRows,
      sampleRows,
      priceHints: priceHints.slice(0, 20),
      htmlHead: html.slice(0, 500),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
