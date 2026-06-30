import * as cheerio from 'cheerio'
import NepaliDate from 'nepali-datetime'
import { randomUUID } from 'crypto'
import { prisma } from '../src/lib/prisma'

const createId = () => randomUUID().replace(/-/g, '')

const AMPIS_MARKETS = [
  { id: 5,  nameEn: 'Birtamod',      nameNe: 'बिर्तामोड',    district: 'Jhapa' },
  { id: 6,  nameEn: 'Dharan',        nameNe: 'धरान',          district: 'Sunsari' },
  { id: 7,  nameEn: 'Dhalkewar',     nameNe: 'ढल्केवर',       district: 'Dhanusha' },
  { id: 8,  nameEn: 'Kamalmai',      nameNe: 'कमलामाई',       district: 'Sindhuli' },
  { id: 9,  nameEn: 'Kawasoti',      nameNe: 'कावासोती',      district: 'Nawalpur' },
  { id: 10, nameEn: 'Pokhara',       nameNe: 'पोखरा',         district: 'Kaski' },
  { id: 11, nameEn: 'Butwal',        nameNe: 'बुटवल',         district: 'Rupandehi' },
  { id: 12, nameEn: 'Kohalpur',      nameNe: 'कोहलपुर',       district: 'Banke' },
  { id: 13, nameEn: 'Birendranagar', nameNe: 'बिरेन्द्रनगर',  district: 'Surkhet' },
  { id: 14, nameEn: 'Attaria',       nameNe: 'अत्तरिया',      district: 'Kailali' },
  { id: 15, nameEn: 'Lalbandi',      nameNe: 'लालबन्दी',      district: 'Sarlahi' },
]

// AMPIS's historical filter only exposes a year taxonomy term for BS years it has
// archived a page for. Re-verify this list against the live <select> before extending
// the range further back — terms appear to be added incrementally as years pass.
const YEAR_ENTITY_ID: Record<number, number> = {
  2080: 16,
  2081: 446538,
  2082: 894719,
  2083: 1614822,
}

// Month term ids run 33 (Baisakh, BS month index 0) .. 44 (Chaitra, index 11) sequentially.
const monthEntityId = (monthIdx0: number) => 33 + monthIdx0

const normalizeNe = (s: string) => s.replace(/\s+\(/g, '(').trim()

async function fetchHistoricalHtml(marketId: number, yearId: number, monthId: number, day: number): Promise<string> {
  const url = `https://ampis.gov.np/market-price-comparison?uid_entityreference_filter=${marketId}&field_commodity_category_target_id_entityreference_filter=2&field_market_rate_year_target_id_entityreference_filter=${yearId}&field_market_rate_month_target_id=${monthId}&field_market_rate_day_target_id=${day}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

// Columns on /market-price-comparison: market, month(ne), day, vegetable(ne), unit, min, max, avg
function parseHistRows(html: string): Array<{ nameNe: string; unit: string; min: number; max: number }> {
  const $ = cheerio.load(html)
  const rows: Array<{ nameNe: string; unit: string; min: number; max: number }> = []
  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 8) return
    const nameNe = normalizeNe($(tds[3]).text().trim())
    const unit = $(tds[4]).text().trim() || 'kg'
    const min = parseFloat($(tds[5]).text().replace(/,/g, '').trim())
    const max = parseFloat($(tds[6]).text().replace(/,/g, '').trim())
    if (!nameNe || isNaN(min) || isNaN(max) || min <= 0) return
    rows.push({ nameNe, unit, min, max })
  })
  return rows
}

async function upsertRows(marketDbId: string, date: Date, rows: Array<{ nameNe: string; unit: string; min: number; max: number }>) {
  if (rows.length === 0) return 0

  const normalizedNames = [...new Set(rows.map((r) => r.nameNe))]
  const withSpaceNames = normalizedNames.map((n) => n.replace(/\(/g, ' ('))
  const allLookupNames = [...new Set([...normalizedNames, ...withSpaceNames])]

  const existing = await prisma.vegetable.findMany({
    where: { nameNe: { in: allLookupNames } },
    select: { id: true, nameNe: true },
  })
  const vegMap = new Map<string, string>()
  for (const v of existing) {
    vegMap.set(v.nameNe, v.id)
    vegMap.set(normalizeNe(v.nameNe), v.id)
  }

  const missing = normalizedNames.filter((n) => !vegMap.has(n))
  if (missing.length > 0) {
    await prisma.vegetable.createMany({
      data: missing.map((n) => {
        const row = rows.find((r) => r.nameNe === n)!
        return { nameNe: n, nameEn: n, nameJa: n, unit: row.unit }
      }),
      skipDuplicates: true,
    })
    const newVegs = await prisma.vegetable.findMany({ where: { nameNe: { in: missing } }, select: { id: true, nameNe: true } })
    for (const v of newVegs) vegMap.set(v.nameNe, v.id)
  }

  // Dedupe by vegId: a single Postgres statement can't UPDATE the same
  // conflict-target row twice, and the comparison page occasionally renders
  // the same vegetable row more than once for a given market/date.
  const byVeg = new Map<string, { vegId: string; min: number; max: number; avg: number }>()
  for (const row of rows) {
    const vegId = vegMap.get(row.nameNe)
    if (!vegId) continue
    byVeg.set(vegId, { vegId, min: row.min, max: row.max, avg: (row.min + row.max) / 2 })
  }
  const records = [...byVeg.values()]
  if (records.length === 0) return 0

  const values = records
    .map((_, i) => `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}::date, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`)
    .join(',')
  const params = records.flatMap((r) => [createId(), r.vegId, marketDbId, date, r.min, r.max, r.avg])

  await prisma.$executeRawUnsafe(
    `INSERT INTO "PriceRecord" (id, "vegetableId", "marketId", "date", "minPrice", "maxPrice", "avgPrice")
     VALUES ${values}
     ON CONFLICT ("vegetableId", "marketId", "date")
     DO UPDATE SET "minPrice" = EXCLUDED."minPrice", "maxPrice" = EXCLUDED."maxPrice", "avgPrice" = EXCLUDED."avgPrice"`,
    ...params
  )
  return records.length
}

function* dateRange(start: Date, end: Date) {
  const d = new Date(start)
  while (d <= end) {
    yield new Date(d)
    d.setUTCDate(d.getUTCDate() + 1)
  }
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let idx = 0
  async function run() {
    while (idx < items.length) {
      const i = idx++
      await worker(items[i])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run))
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit-days='))
  const marketArg = process.argv.find((a) => a.startsWith('--market='))
  const startArg = process.argv.find((a) => a.startsWith('--start='))
  const endArg = process.argv.find((a) => a.startsWith('--end='))

  const RANGE_START = startArg ? new Date(startArg.split('=')[1] + 'T00:00:00Z') : new Date('2024-01-01T00:00:00Z')
  const todayUTC = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z')
  const RANGE_END = endArg ? new Date(endArg.split('=')[1] + 'T00:00:00Z') : todayUTC
  const maxDays = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity
  const onlyMarket = marketArg ? marketArg.split('=')[1] : null

  const markets = onlyMarket ? AMPIS_MARKETS.filter((m) => m.nameEn === onlyMarket) : AMPIS_MARKETS
  if (markets.length === 0) {
    console.error('No matching market for --market=' + onlyMarket)
    process.exit(1)
  }

  const dbMarkets = await Promise.all(
    markets.map((m) =>
      prisma.market.upsert({
        where: { nameEn: m.nameEn },
        update: {},
        create: { nameEn: m.nameEn, nameNe: m.nameNe, district: m.district, source: 'ampis' },
      })
    )
  )
  const dbMarketMap = new Map(markets.map((m, i) => [m.id, dbMarkets[i].id]))

  const allDates = [...dateRange(RANGE_START, RANGE_END)].slice(0, maxDays)

  // Skip (market, date) pairs we already have data for, so reruns are cheap and resumable.
  const existing = await prisma.priceRecord.findMany({
    where: { marketId: { in: dbMarkets.map((m) => m.id) }, date: { gte: RANGE_START, lte: RANGE_END } },
    select: { marketId: true, date: true },
    distinct: ['marketId', 'date'],
  })
  const existingSet = new Set(existing.map((e) => `${e.marketId}|${e.date.toISOString().split('T')[0]}`))

  type Job = { marketId: number; dbMarketId: string; date: Date }
  const jobs: Job[] = []
  for (const m of markets) {
    const dbMarketId = dbMarketMap.get(m.id)!
    for (const date of allDates) {
      const dateStr = date.toISOString().split('T')[0]
      if (existingSet.has(`${dbMarketId}|${dateStr}`)) continue
      jobs.push({ marketId: m.id, dbMarketId, date })
    }
  }

  console.log(`Total jobs: ${jobs.length} (${allDates.length} days x ${markets.length} markets, ${jobs.length === 0 ? 0 : (existing.length)} already in DB)`)

  let done = 0
  let withData = 0
  let totalRows = 0
  const startTime = Date.now()

  await pool(jobs, 4, async (job) => {
    const nd = new NepaliDate(job.date)
    const bsYear = nd.getYear()
    const bsMonthIdx = nd.getMonth()
    const bsDay = nd.getDate()
    const yearId = YEAR_ENTITY_ID[bsYear]
    if (!yearId) {
      done++
      return
    }
    const html = await fetchHistoricalHtml(job.marketId, yearId, monthEntityId(bsMonthIdx), bsDay)
    const rows = parseHistRows(html)
    if (rows.length > 0) {
      const n = await upsertRows(job.dbMarketId, job.date, rows)
      withData++
      totalRows += n
    }
    done++
    if (done % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      console.log(`[${done}/${jobs.length}] withData=${withData} rows=${totalRows} elapsed=${elapsed}s`)
    }
    await new Promise((r) => setTimeout(r, 150))
  })

  console.log(`DONE. jobs=${jobs.length} withData=${withData} totalRows=${totalRows} elapsedSec=${((Date.now() - startTime) / 1000).toFixed(0)}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
