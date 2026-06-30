import * as cheerio from 'cheerio'
import { randomUUID } from 'crypto'
import { prisma } from './prisma'

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

// Normalise Nepali names: remove spaces before ( to prevent duplicate records
// when the AMPIS website toggles between "नाम (variant)" and "नाम(variant)".
const normalizeNe = (s: string) => s.replace(/\s+\(/g, '(').trim()

async function fetchMarketHtml(marketId: number): Promise<string> {
  try {
    const body = new URLSearchParams({
      view_name: 'bajar_price_list',
      view_display_id: 'block_3',
      uid_entityreference_filter: String(marketId),
      field_commodity_category_target_id_entityreference_filter: '2',
    })

    const res = await fetch('https://ampis.gov.np/views/ajax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 0 },
    })

    if (!res.ok) return ''
    const commands: Array<{ command: string; data?: string }> = await res.json()
    const insertCmd = commands.find((c) => c.command === 'insert' && (c.data?.length ?? 0) > 100)
    return insertCmd?.data ?? ''
  } catch {
    return ''
  }
}

function parseRows(html: string): Array<{ nameNe: string; unit: string; min: number; max: number }> {
  const $ = cheerio.load(html)
  const rows: Array<{ nameNe: string; unit: string; min: number; max: number }> = []

  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 4) return
    const nameNe = normalizeNe($(tds[0]).text().trim())
    const unit = $(tds[1]).text().trim() || 'kg'
    const min = parseFloat($(tds[2]).text().replace(/,/g, '').trim())
    const max = parseFloat($(tds[3]).text().replace(/,/g, '').trim())
    if (!nameNe || isNaN(min) || isNaN(max) || min <= 0) return
    rows.push({ nameNe, unit, min, max })
  })

  return rows
}

type ParsedRow = {
  dbMarketId: string
  nameNe: string
  unit: string
  min: number
  max: number
}

export type AmpisMarketResult = { nameEn: string; rows: number }

export type AmpisScrapeResult = {
  total: number
  markets: AmpisMarketResult[]
}

// AMPIS itself sometimes doesn't publish a market's table for the day (no rows,
// no date header at all) — that's an upstream data gap, not a scraper failure.
// Surface it plainly in ScrapeLog instead of letting a "success" run hide it.
export function describeZeroRowMarkets(markets: AmpisMarketResult[]): string | null {
  const zeroRowMarkets = markets.filter((m) => m.rows === 0).map((m) => m.nameEn)
  if (zeroRowMarkets.length === 0) return null
  return `AMPIS未公開 (0件): ${zeroRowMarkets.join(', ')}`
}

export async function scrapeAmpis(): Promise<AmpisScrapeResult> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 1. Ensure all markets exist in DB (parallel upserts — fast, small set)
  const dbMarkets = await Promise.all(
    AMPIS_MARKETS.map((m) =>
      prisma.market.upsert({
        where: { nameEn: m.nameEn },
        update: {},
        create: { nameEn: m.nameEn, nameNe: m.nameNe, district: m.district, source: 'ampis' },
      })
    )
  )

  // 2. Fetch all market HTML in parallel (network I/O, no DB involved)
  const htmls = await Promise.all(AMPIS_MARKETS.map((m) => fetchMarketHtml(m.id)))

  // 3. Parse and collect all rows (no DB at this stage), tracking per-market counts
  const allRows: ParsedRow[] = []
  const marketResults: AmpisMarketResult[] = []
  for (let i = 0; i < AMPIS_MARKETS.length; i++) {
    const parsed = parseRows(htmls[i])
    marketResults.push({ nameEn: AMPIS_MARKETS[i].nameEn, rows: parsed.length })
    for (const row of parsed) {
      allRows.push({ dbMarketId: dbMarkets[i].id, ...row })
    }
  }

  if (allRows.length === 0) return { total: 0, markets: marketResults }

  // 4. Batch-lookup all vegetables by both normalised and space-prefixed names
  //    (space-prefixed lookup catches legacy DB records created before normaliseNe was applied)
  const normalizedNames = [...new Set(allRows.map((r) => r.nameNe))]
  const withSpaceNames = normalizedNames.map((n) => n.replace(/\(/g, ' ('))
  const allLookupNames = [...new Set([...normalizedNames, ...withSpaceNames])]

  const existing = await prisma.vegetable.findMany({
    where: { nameNe: { in: allLookupNames } },
    select: { id: true, nameNe: true },
  })

  // Map both the stored form and its normalised form to the same id
  const vegMap = new Map<string, string>()
  for (const v of existing) {
    vegMap.set(v.nameNe, v.id)
    vegMap.set(normalizeNe(v.nameNe), v.id)
  }

  // 5. Create vegetables that don't exist yet (single batch)
  const missing = normalizedNames.filter((n) => !vegMap.has(n))
  if (missing.length > 0) {
    await prisma.vegetable.createMany({
      data: missing.map((n) => {
        const row = allRows.find((r) => r.nameNe === n)!
        return { nameNe: n, nameEn: n, nameJa: n, unit: row.unit }
      }),
      skipDuplicates: true,
    })
    const newVegs = await prisma.vegetable.findMany({
      where: { nameNe: { in: missing } },
      select: { id: true, nameNe: true },
    })
    for (const v of newVegs) vegMap.set(v.nameNe, v.id)
  }

  // 6. Single bulk upsert for all price records
  const records = allRows.flatMap((row) => {
    const vegId = vegMap.get(row.nameNe)
    if (!vegId) return []
    const avg = (row.min + row.max) / 2
    return [{ vegId, marketId: row.dbMarketId, min: row.min, max: row.max, avg }]
  })

  if (records.length === 0) return { total: 0, markets: marketResults }

  const values = records
    .map(
      (_, i) =>
        `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}::date, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
    )
    .join(',')
  const params = records.flatMap((r) => [createId(), r.vegId, r.marketId, today, r.min, r.max, r.avg])

  await prisma.$executeRawUnsafe(
    `INSERT INTO "PriceRecord" (id, "vegetableId", "marketId", "date", "minPrice", "maxPrice", "avgPrice")
     VALUES ${values}
     ON CONFLICT ("vegetableId", "marketId", "date")
     DO UPDATE SET
       "minPrice" = EXCLUDED."minPrice",
       "maxPrice" = EXCLUDED."maxPrice",
       "avgPrice" = EXCLUDED."avgPrice"`,
    ...params
  )

  return { total: records.length, markets: marketResults }
}
