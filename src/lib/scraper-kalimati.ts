import * as cheerio from 'cheerio'
import { prisma } from './prisma'
import { randomUUID } from 'crypto'
const createId = () => randomUUID().replace(/-/g, '')

const KALIMATI_URL = 'https://kalimatimarket.gov.np/price'
const KALIMATI_MARKET_EN = 'Kalimati'

// Maps Kalimati-specific nameNe (after space normalization) to canonical AMPIS nameNe.
// Kalimati uses variant spellings or different structures for vegetables that AMPIS tracks
// under a standardized name. Without this map, each scrape would re-create duplicate records.
const KALIMATI_CANONICAL: Record<string, string> = {
  // Tomatoes: Kalimati spells गोलभेडा; AMPIS uses standard गोलभेंडा + space before (
  'गोलभेडा सानो(लोकल)':     'गोलभेंडा सानो (लोकल)',
  'गोलभेडा ठूलो(नेपाली)':   'गोलभेंडा ठुलो (नेपाली)',
  'गोलभेडा ठूलो(भारतीय)':   'गोलभेंडा ठुलो (भारतीय)',
  'गोलभेडा सानो(टनेल)':     'गोलभेंडा सानो (टनेल)',
  // Cauliflower local: Kalimati uses "स्थानिय" without parens; AMPIS uses "(स्थानीय)"
  'काउली स्थानिय':          'काउली (स्थानीय)',
  // Carrot local: Kalimati spells गाजर; AMPIS uses गाँजर with anusvara
  'गाजर(लोकल)':             'गाँजर (लोकल)',
  // White radish hybrid: Kalimati reverses word order and spells हाइब्रीड differently
  'सेतो मूला(हाइब्रीड)':    'मूला सेतो (हाइब्रिड)',
  // Barela: Kalimati website lists this in English; AMPIS tracks it as बरेला
  'Barela':                  'बरेला',
  // Fenugreek Leaf: Kalimati English name; canonical AMPIS nameNe is मेथीको साग
  'Fenugreek Leaf':          'मेथीको साग',
}

function parseNepaliPrice(text: string): number {
  const cleaned = text
    .replace(/रू\s*/g, '')
    .replace(/[०१२३४५६७८९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)))
    .replace(/,/g, '')
    .trim()
  return parseFloat(cleaned)
}

async function fetchRows(date?: Date): Promise<Array<{ nameNe: string; unit: string; min: number; max: number; avg: number }>> {
  const url = date
    ? `${KALIMATI_URL}?date=${date.toISOString().split('T')[0]}`
    : KALIMATI_URL
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Kalimati fetch failed: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const totalRows = $('table tbody tr').length
  console.log(`[Kalimati] HTML length: ${html.length}, tbody rows: ${totalRows}, url: ${url}`)

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
  return rows
}

export async function scrapeKalimati(targetDate?: Date): Promise<number> {
  const market = await prisma.market.upsert({
    where: { nameEn: KALIMATI_MARKET_EN },
    update: {},
    create: { nameEn: KALIMATI_MARKET_EN, nameNe: 'कालिमाटी', district: 'Kathmandu', source: 'kalimati' },
  })

  const today = targetDate ? new Date(targetDate) : new Date()
  today.setHours(0, 0, 0, 0)

  // Fetch rows — if today returns 0, fall back to yesterday
  let rows = await fetchRows(targetDate)
  let actualDate = today

  if (rows.length === 0) {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    console.log(`[Kalimati] 0 rows for today, trying yesterday: ${yesterday.toISOString().split('T')[0]}`)
    rows = await fetchRows(yesterday)
    if (rows.length > 0) {
      actualDate = yesterday
    }
  }

  if (rows.length === 0) {
    console.error('[Kalimati] 0 rows for both today and yesterday — skipping')
    await prisma.scrapeLog.create({
      data: { source: 'kalimati', targetDate: today, itemsCount: 0, success: false, message: '0 rows from website' },
    })
    return 0
  }

  // Normalize nameNe: remove spaces before ( then apply canonical name mapping
  const normalizeNe = (s: string) => {
    const noSpaceParen = s.replace(/\s+\(/g, '(').trim()
    return KALIMATI_CANONICAL[noSpaceParen] ?? noSpaceParen
  }
  rows = rows.map((r) => ({ ...r, nameNe: normalizeNe(r.nameNe) }))

  // Batch: look up all existing vegetables in one query (also try with-space variants)
  const nameNeList = rows.map((r) => r.nameNe)
  const existingVegs = await prisma.vegetable.findMany({
    where: { nameNe: { in: [...nameNeList, ...nameNeList.map((n) => n.replace(/\(/g, ' ('))] } },
    select: { id: true, nameNe: true },
  })
  const vegMap = new Map<string, string>()
  for (const v of existingVegs) {
    vegMap.set(v.nameNe, v.id)
    vegMap.set(normalizeNe(v.nameNe), v.id)
  }

  // Create missing vegetables in bulk
  const missing = rows.filter((r) => !vegMap.has(r.nameNe))
  if (missing.length > 0) {
    const newVegs = missing.map((r) => ({
      id: createId(),
      nameNe: r.nameNe,
      nameEn: r.nameNe,
      nameJa: r.nameNe,
      unit: r.unit,
      category: 'vegetable',
    }))
    await prisma.vegetable.createMany({ data: newVegs, skipDuplicates: true })
    newVegs.forEach((v) => vegMap.set(v.nameNe, v.id))
  }

  // Bulk upsert price records via raw SQL. Dedupe by vegId: a single Postgres
  // statement can't UPDATE the same ON CONFLICT target row twice, and a
  // duplicate-rendered Kalimati row would otherwise crash the whole save.
  const byVeg = new Map<string, { vegId: string; min: number; max: number; avg: number }>()
  for (const r of rows) {
    const vegId = vegMap.get(r.nameNe)
    if (!vegId) continue
    byVeg.set(vegId, { vegId, min: r.min, max: r.max, avg: r.avg })
  }
  const values = [...byVeg.values()]

  if (values.length > 0) {
    const dateStr = actualDate.toISOString().split('T')[0]
    const params: (string | number)[] = []
    const placeholders = values.map((v, i) => {
      const base = i * 7
      params.push(createId(), v.vegId, market.id, dateStr, v.min, v.max, v.avg)
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}, $${base + 6}, $${base + 7})`
    }).join(', ')

    await prisma.$executeRawUnsafe(`
      INSERT INTO "PriceRecord" (id, "vegetableId", "marketId", date, "minPrice", "maxPrice", "avgPrice")
      VALUES ${placeholders}
      ON CONFLICT ("vegetableId", "marketId", date) DO UPDATE SET
        "minPrice" = EXCLUDED."minPrice",
        "maxPrice" = EXCLUDED."maxPrice",
        "avgPrice" = EXCLUDED."avgPrice"
    `, ...params)
  }

  // Flag a sharp drop vs. yesterday's saved count — usually means Kalimati served
  // a partial/broken table rather than a parser bug on our side.
  const yesterdayForDrop = new Date(actualDate)
  yesterdayForDrop.setDate(yesterdayForDrop.getDate() - 1)
  const prevCount = await prisma.priceRecord.count({ where: { marketId: market.id, date: yesterdayForDrop } })
  const dropMessage = prevCount >= 5 && values.length > 0 && values.length <= prevCount * 0.4
    ? `件数急減 (${prevCount}→${values.length}件)`
    : null

  console.log(`[Kalimati] Saved ${values.length} records for ${actualDate.toISOString().split('T')[0]}`)
  await prisma.scrapeLog.create({
    data: {
      source: 'kalimati',
      targetDate: actualDate,
      itemsCount: values.length,
      success: true,
      message: dropMessage ?? (actualDate.toISOString().split('T')[0] === today.toISOString().split('T')[0]
        ? null
        : `Used fallback date (yesterday)`),
    },
  })
  return values.length
}
