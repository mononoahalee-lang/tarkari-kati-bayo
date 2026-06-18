/**
 * Maximum historical backfill for Kalimati market.
 * Fetches newest-to-oldest and stops after 30 consecutive empty days.
 * Runs 4 concurrent workers to speed up fetching.
 */
import * as cheerio from 'cheerio'
import { prisma } from './src/lib/prisma'

const KALIMATI_URL = 'https://kalimatimarket.gov.np/price'
const CONCURRENCY = 4
const DELAY_MS = 400
const MAX_CONSECUTIVE_EMPTY = 30

const vegCache = new Map<string, string>()

function parseNepaliPrice(text: string): number {
  return parseFloat(
    text
      .replace(/रू\s*/g, '')
      .replace(/[०१२३४५६७८९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)))
      .replace(/,/g, '')
      .trim()
  )
}

async function getVegId(nameNe: string, unit: string): Promise<string> {
  if (vegCache.has(nameNe)) return vegCache.get(nameNe)!
  const veg = await prisma.vegetable.upsert({
    where: { nameNe },
    update: {},
    create: { nameNe, nameEn: nameNe, nameJa: nameNe, unit },
  })
  vegCache.set(nameNe, veg.id)
  return veg.id
}

async function scrapeDay(marketId: string, date: Date): Promise<'ok' | 'empty' | 'error'> {
  const dateStr = date.toISOString().split('T')[0]
  try {
    const res = await fetch(`${KALIMATI_URL}?date=${dateStr}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)' },
    })
    if (!res.ok) return 'error'
    const html = await res.text()
    const $ = cheerio.load(html)

    const rows: Array<{ nameNe: string; unit: string; min: number; max: number; avg: number }> = []
    $('table tbody tr').each((_, tr) => {
      const tds = $(tr).find('td')
      if (tds.length < 5) return
      const nameNe = $(tds[0]).text().trim()
      const unit = $(tds[1]).text().trim() || 'kg'
      const min = parseNepaliPrice($(tds[2]).text())
      const max = parseNepaliPrice($(tds[3]).text())
      const avg = parseNepaliPrice($(tds[4]).text())
      if (!nameNe || isNaN(min) || isNaN(max) || isNaN(avg)) return
      rows.push({ nameNe, unit, min, max, avg })
    })

    if (rows.length === 0) return 'empty'

    const day = new Date(date)
    day.setHours(0, 0, 0, 0)

    const vegIds = await Promise.all(rows.map((r) => getVegId(r.nameNe, r.unit)))

    await prisma.priceRecord.createMany({
      data: rows.map((row, i) => ({
        vegetableId: vegIds[i],
        marketId,
        date: day,
        minPrice: row.min,
        maxPrice: row.max,
        avgPrice: row.avg,
      })),
      skipDuplicates: true,
    })

    console.log(`${dateStr}: ${rows.length} records`)
    return 'ok'
  } catch (e) {
    console.error(`${dateStr}: ERROR — ${e}`)
    return 'error'
  }
}

async function main() {
  const market = await prisma.market.upsert({
    where: { nameEn: 'Kalimati' },
    update: {},
    create: { nameEn: 'Kalimati', nameNe: 'कालिमाटी', district: 'Kathmandu', source: 'kalimati' },
  })

  // Pre-warm vegetable cache
  const existingVegs = await prisma.vegetable.findMany({ select: { id: true, nameNe: true } })
  for (const v of existingVegs) vegCache.set(v.nameNe, v.id)
  console.log(`Loaded ${vegCache.size} vegetables from DB`)

  // Find already-fetched dates
  const existingDates = await prisma.priceRecord.findMany({
    where: { marketId: market.id },
    distinct: ['date'],
    select: { date: true },
  })
  const existingSet = new Set(existingDates.map((d) => d.date.toISOString().split('T')[0]))
  console.log(`Already have ${existingSet.size} dates for Kalimati`)

  // Generate dates from 3650 days ago to today, newest-to-oldest (skip existing)
  const MAX_DAYS = 3650
  const dates: Date[] = []
  for (let i = 0; i <= MAX_DAYS; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const dateStr = d.toISOString().split('T')[0]
    if (!existingSet.has(dateStr)) dates.push(new Date(d))
  }
  console.log(`\nFetching ${dates.length} missing dates with ${CONCURRENCY} workers...\n`)

  let totalSaved = 0
  let consecutiveEmpty = 0

  for (let i = 0; i < dates.length; i += CONCURRENCY) {
    const batch = dates.slice(i, i + CONCURRENCY)

    const results = await Promise.allSettled(
      batch.map((date) => scrapeDay(market.id, date))
    )

    for (const r of results) {
      const result = r.status === 'fulfilled' ? r.value : 'error'
      if (result === 'ok') {
        totalSaved++
        consecutiveEmpty = 0
      } else if (result === 'empty') {
        consecutiveEmpty++
      }
    }

    // Stop when we've hit consecutive empty days (beyond data range)
    if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
      const lastDate = batch[batch.length - 1]
      console.log(`\nStopped at ${lastDate.toISOString().split('T')[0]} — ${MAX_CONSECUTIVE_EMPTY} consecutive empty days (data range limit)`)
      break
    }

    if (i + CONCURRENCY < dates.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  console.log(`\nDone! Saved ${totalSaved} batches of records.`)
  console.log(`Total Kalimati dates in DB: ${existingSet.size + totalSaved}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
