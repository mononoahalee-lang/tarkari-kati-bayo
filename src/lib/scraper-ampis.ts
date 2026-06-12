import * as cheerio from 'cheerio'
import { prisma } from './prisma'

// AMPIS market IDs from the dropdown (uid_entityreference_filter)
const AMPIS_MARKETS = [
  { id: 5,  nameEn: 'Birtamod',      nameNe: 'बिर्तामोड',     district: 'Jhapa' },
  { id: 6,  nameEn: 'Dharan',        nameNe: 'धरान',           district: 'Sunsari' },
  { id: 7,  nameEn: 'Dhalkewar',     nameNe: 'ढल्केवर',        district: 'Dhanusha' },
  { id: 8,  nameEn: 'Kamalmai',      nameNe: 'कमलामाई',        district: 'Sindhuli' },
  { id: 9,  nameEn: 'Kawasoti',      nameNe: 'कावासोती',       district: 'Nawalpur' },
  { id: 10, nameEn: 'Pokhara',       nameNe: 'पोखरा',          district: 'Kaski' },
  { id: 11, nameEn: 'Butwal',        nameNe: 'बुटवल',          district: 'Rupandehi' },
  { id: 12, nameEn: 'Kohalpur',      nameNe: 'कोहलपुर',        district: 'Banke' },
  { id: 13, nameEn: 'Birendranagar', nameNe: 'बिरेन्द्रनगर',   district: 'Surkhet' },
  { id: 14, nameEn: 'Attaria',       nameNe: 'अत्तरिया',       district: 'Kailali' },
  { id: 15, nameEn: 'Lalbandi',      nameNe: 'लालबन्दी',       district: 'Sarlahi' },
]

const BASE_URL = 'https://ampis.gov.np/market-price-comparison'

async function fetchMarketPrices(marketId: number): Promise<Array<{
  nameNe: string; unit: string; min: number; max: number
}>> {
  const url = `${BASE_URL}?uid_entityreference_filter=${marketId}&field_commodity_category_target_id_entityreference_filter=2`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)' },
    next: { revalidate: 0 },
  })
  if (!res.ok) return []

  const html = await res.text()
  const $ = cheerio.load(html)
  const rows: Array<{ nameNe: string; unit: string; min: number; max: number }> = []

  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 4) return
    const nameNe = $(tds[0]).text().trim()
    const unit = $(tds[1]).text().trim() || 'kg'
    const min = parseFloat($(tds[2]).text().replace(/,/g, '').trim())
    const max = parseFloat($(tds[3]).text().replace(/,/g, '').trim())
    if (!nameNe || isNaN(min) || isNaN(max)) return
    rows.push({ nameNe, unit, min, max })
  })

  return rows
}

export async function scrapeAmpis(): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let saved = 0

  for (const marketDef of AMPIS_MARKETS) {
    let marketId: string
    try {
      const market = await prisma.market.upsert({
        where: { nameEn: marketDef.nameEn },
        update: {},
        create: {
          nameEn: marketDef.nameEn,
          nameNe: marketDef.nameNe,
          district: marketDef.district,
          source: 'ampis',
        },
      })
      marketId = market.id
    } catch {
      continue
    }

    const rows = await fetchMarketPrices(marketDef.id)

    for (const row of rows) {
      const avg = (row.min + row.max) / 2

      const vegetable = await prisma.vegetable.upsert({
        where: { nameNe: row.nameNe },
        update: {},
        create: {
          nameNe: row.nameNe,
          nameEn: row.nameNe,
          nameJa: row.nameNe,
          unit: row.unit,
        },
      })

      await prisma.priceRecord.upsert({
        where: {
          vegetableId_marketId_date: {
            vegetableId: vegetable.id,
            marketId,
            date: today,
          },
        },
        update: { minPrice: row.min, maxPrice: row.max, avgPrice: avg },
        create: {
          vegetableId: vegetable.id,
          marketId,
          date: today,
          minPrice: row.min,
          maxPrice: row.max,
          avgPrice: avg,
        },
      })
      saved++
    }

    // Small delay to be polite to the server
    await new Promise((r) => setTimeout(r, 500))
  }

  return saved
}
