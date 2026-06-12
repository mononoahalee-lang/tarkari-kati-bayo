import * as cheerio from 'cheerio'
import { prisma } from './prisma'

const KALIMATI_URL = 'https://kalimatimarket.gov.np/price'
const KALIMATI_MARKET_EN = 'Kalimati'

export async function scrapeKalimati(): Promise<number> {
  const res = await fetch(KALIMATI_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)' },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Kalimati fetch failed: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const market = await prisma.market.upsert({
    where: { nameEn: KALIMATI_MARKET_EN },
    update: {},
    create: {
      nameEn: KALIMATI_MARKET_EN,
      nameNe: 'कालिमाटी',
      district: 'Kathmandu',
      source: 'kalimati',
    },
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let saved = 0
  const rows: Array<{
    nameNe: string
    unit: string
    min: number
    max: number
    avg: number
  }> = []

  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 5) return
    const nameNe = $(tds[0]).text().trim()
    const unit = $(tds[1]).text().trim() || 'kg'
    const min = parseFloat($(tds[2]).text().replace(/,/g, '').trim())
    const max = parseFloat($(tds[3]).text().replace(/,/g, '').trim())
    const avg = parseFloat($(tds[4]).text().replace(/,/g, '').trim())
    if (!nameNe || isNaN(min) || isNaN(max) || isNaN(avg)) return
    rows.push({ nameNe, unit, min, max, avg })
  })

  for (const row of rows) {
    const vegetable = await prisma.vegetable.upsert({
      where: { nameNe: row.nameNe },
      update: {},
      create: {
        nameNe: row.nameNe,
        nameEn: row.nameNe, // placeholder — enriched by AI later
        nameJa: row.nameNe, // placeholder — enriched by AI later
        unit: row.unit,
      },
    })

    await prisma.priceRecord.upsert({
      where: {
        vegetableId_marketId_date: {
          vegetableId: vegetable.id,
          marketId: market.id,
          date: today,
        },
      },
      update: { minPrice: row.min, maxPrice: row.max, avgPrice: row.avg },
      create: {
        vegetableId: vegetable.id,
        marketId: market.id,
        date: today,
        minPrice: row.min,
        maxPrice: row.max,
        avgPrice: row.avg,
      },
    })
    saved++
  }

  return saved
}
