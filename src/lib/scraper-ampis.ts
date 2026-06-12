import * as cheerio from 'cheerio'
import { prisma } from './prisma'

const AMPIS_URL = 'https://ampis.gov.np/'

// Known AMPIS markets — extended as discovered
const AMPIS_MARKETS = [
  { nameEn: 'Birtamod', nameNe: 'बिर्तामोड', district: 'Jhapa' },
  { nameEn: 'Dharan', nameNe: 'धरान', district: 'Sunsari' },
  { nameEn: 'Dhalkewar', nameNe: 'धलकेवर', district: 'Sarlahi' },
  { nameEn: 'Kamalmai', nameNe: 'कमलमाई', district: 'Sindhuli' },
  { nameEn: 'Kawasoti', nameNe: 'कावासोती', district: 'Nawalpur' },
  { nameEn: 'Pokhara', nameNe: 'पोखरा', district: 'Kaski' },
  { nameEn: 'Butwal', nameNe: 'बुटवल', district: 'Rupandehi' },
  { nameEn: 'Kohalpur', nameNe: 'कोहलपुर', district: 'Banke' },
  { nameEn: 'Birendranagar', nameNe: 'विरेन्द्रनगर', district: 'Surkhet' },
  { nameEn: 'Attaria', nameNe: 'अत्तरिया', district: 'Kailali' },
  { nameEn: 'Lalband', nameNe: 'लालबन्दी', district: 'Sarlahi' },
]

export async function scrapeAmpis(): Promise<number> {
  // Fetch main page to get form tokens and current prices
  const res = await fetch(AMPIS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)' },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`AMPIS fetch failed: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let saved = 0

  // Parse price table on main page (shows latest prices per market)
  // AMPIS shows a combined table — each row may include market name
  const tableRows: Array<{
    marketName: string
    nameNe: string
    unit: string
    min: number
    max: number
    avg: number
  }> = []

  // Try to find table with price data
  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 5) return

    // AMPIS table structure can vary; try common patterns
    let offset = 0
    let marketName = ''

    if (tds.length >= 6) {
      // Market name may be in first column
      marketName = $(tds[0]).text().trim()
      offset = 1
    }

    const nameNe = $(tds[offset]).text().trim()
    const unit = $(tds[offset + 1]).text().trim() || 'kg'
    const min = parseFloat($(tds[offset + 2]).text().replace(/,/g, '').trim())
    const max = parseFloat($(tds[offset + 3]).text().replace(/,/g, '').trim())
    const avg = parseFloat($(tds[offset + 4]).text().replace(/,/g, '').trim())

    if (!nameNe || isNaN(min) || isNaN(max) || isNaN(avg)) return
    tableRows.push({ marketName: marketName || 'AMPIS', nameNe, unit, min, max, avg })
  })

  // Upsert markets and records
  const marketCache = new Map<string, string>()

  for (const row of tableRows) {
    const knownMarket = AMPIS_MARKETS.find(
      (m) => row.marketName.includes(m.nameNe) || row.marketName.includes(m.nameEn)
    ) ?? { nameEn: row.marketName || 'AMPIS', nameNe: row.marketName || 'AMPIS', district: 'Nepal' }

    let marketId = marketCache.get(knownMarket.nameEn)
    if (!marketId) {
      const market = await prisma.market.upsert({
        where: { nameEn: knownMarket.nameEn },
        update: {},
        create: { ...knownMarket, source: 'ampis' },
      })
      marketId = market.id
      marketCache.set(knownMarket.nameEn, marketId)
    }

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
      update: { minPrice: row.min, maxPrice: row.max, avgPrice: row.avg },
      create: {
        vegetableId: vegetable.id,
        marketId,
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
