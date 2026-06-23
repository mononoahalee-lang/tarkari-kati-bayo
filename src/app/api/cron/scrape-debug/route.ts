import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = 'https://kalimatimarket.gov.np'
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  }

  try {
    // Step 1: Get the main page to find CSRF token and cookies
    const pageRes = await fetch(`${baseUrl}/price`, { headers, signal: AbortSignal.timeout(20000) })
    const html = await pageRes.text()
    const cookies = pageRes.headers.get('set-cookie') ?? ''
    const $ = cheerio.load(html)

    // Extract CSRF token (common in Laravel apps)
    const csrfToken = $('meta[name="csrf-token"]').attr('content')
      ?? $('input[name="_token"]').val()
      ?? null

    // Find all script src URLs (may reveal API endpoints)
    const scripts: string[] = []
    $('script[src]').each((_, el) => { scripts.push($(el).attr('src') ?? '') })

    // Look for inline JSON data (some sites embed data in window.__INITIAL_STATE__ etc.)
    const inlineData: string[] = []
    $('script:not([src])').each((_, el) => {
      const text = $(el).html() ?? ''
      if (text.includes('price') || text.includes('tarkari') || text.includes('vegetable') || text.includes('route')) {
        inlineData.push(text.slice(0, 300))
      }
    })

    // Step 2: Try known API patterns
    const apiAttempts: Record<string, string> = {}

    // Try Ajax endpoint for price data
    const ajaxHeaders = {
      ...headers,
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': csrfToken ?? '',
      'Cookie': cookies.split(',')[0] ?? '',
      'Referer': `${baseUrl}/price`,
    }

    const endpoints = [
      '/price/data',
      '/api/price',
      '/prices',
      '/vegetable-price',
      '/price?format=json',
    ]

    for (const ep of endpoints) {
      try {
        const r = await fetch(`${baseUrl}${ep}`, {
          headers: ajaxHeaders,
          signal: AbortSignal.timeout(5000),
        })
        const text = await r.text()
        apiAttempts[ep] = `${r.status}: ${text.slice(0, 200)}`
      } catch (e) {
        apiAttempts[ep] = `error: ${String(e).slice(0, 100)}`
      }
    }

    return NextResponse.json({
      pageStatus: pageRes.status,
      htmlLength: html.length,
      tables: $('table').length,
      tbodyRows: $('table tbody tr').length,
      allTr: $('tr').length,
      csrfToken,
      cookies: cookies.slice(0, 200),
      scripts: scripts.slice(0, 10),
      inlineDataSnippets: inlineData.slice(0, 3),
      htmlHead: html.slice(0, 1000),
      apiAttempts,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
