import * as cheerio from 'cheerio'
import { prisma } from './prisma'

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

async function fetchMarketHtml(marketId: number): Promise<string> {
  // Use Drupal Views AJAX endpoint — static HTML response is empty due to JS rendering
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
    next: { revalidate: 0 },
  })

  if (!res.ok) return ''

  const commands: Array<{ command: string; data?: string }> = await res.json()
  const insertCmd = commands.find((c) => c.command === 'insert' && (c.data?.length ?? 0) > 500)
  return insertCmd?.data ?? ''
}

function parseRows(html: string): Array<{ nameNe: string; unit: string; min: number; max: number }> {
  const $ = cheerio.load(html)
  const rows: Array<{ nameNe: string; unit: string; min: number; max: number }> = []

  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 4) return
    const nameNe = $(tds[0]).text().trim()
    const unit = $(tds[1]).text().trim() || 'kg'
    const min = parseFloat($(tds[2]).text().replace(/,/g, '').trim())
    const max = parseFloat($(tds[3]).text().replace(/,/g, '').trim())
    if (!nameNe || isNaN(min) || isNaN(max) || min <= 0) return
    rows.push({ nameNe, unit, min, max })
  })

  return rows
}

export async function scrapeAmpis(): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let saved = 0

  for (const marketDef of AMPIS_MARKETS) {
    const market = await prisma.market.upsert({
      where: { nameEn: marketDef.nameEn },
      update: {},
      create: { nameEn: marketDef.nameEn, nameNe: marketDef.nameNe, district: marketDef.district, source: 'ampis' },
    })

    const html = await fetchMarketHtml(marketDef.id)
    const rows = parseRows(html)

    for (const row of rows) {
      const avg = (row.min + row.max) / 2
      const vegetable = await prisma.vegetable.upsert({
        where: { nameNe: row.nameNe },
        update: {},
        create: { nameNe: row.nameNe, nameEn: row.nameNe, nameJa: row.nameNe, unit: row.unit },
      })

      await prisma.priceRecord.upsert({
        where: { vegetableId_marketId_date: { vegetableId: vegetable.id, marketId: market.id, date: today } },
        update: { minPrice: row.min, maxPrice: row.max, avgPrice: avg },
        create: { vegetableId: vegetable.id, marketId: market.id, date: today, minPrice: row.min, maxPrice: row.max, avgPrice: avg },
      })
      saved++
    }

    await new Promise((r) => setTimeout(r, 400))
  }

  return saved
}
