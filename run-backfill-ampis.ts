/**
 * AMPIS Historical Backfill
 * Fetches price data via block_4 (per-product across all markets, with date filter).
 * Uses Bikram Sambat (BS) → AD date conversion.
 *
 * Coverage: 2080-2083 BS (~2023-2026 AD) for 11 AMPIS markets.
 * Strategy: For each year/month/day, probe one product first. If data exists, fetch all products.
 */
import * as cheerio from 'cheerio'
import { prisma } from './src/lib/prisma'

// BS year data: start date (Baisakh 1) and month lengths [Baisakh..Chaitra]
const BS_YEAR_DATA: Record<number, { start: string; months: number[] }> = {
  2080: { start: '2023-04-14', months: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31] },
  2081: { start: '2024-04-13', months: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30] },
  2082: { start: '2025-04-14', months: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30] },
  2083: { start: '2026-04-14', months: [31, 31, 32, 32, 31, 30, 30, 30, 29, 29, 30, 30] },
}

// Month IDs in AMPIS (node reference IDs, not month numbers)
const MONTH_IDS: Record<number, number> = {
  1: 33, // Baisakh
  2: 34, // Jestha
  3: 35, // Ashadh
  4: 36, // Shrawan
  5: 37, // Bhadra
  6: 38, // Ashwin
  7: 39, // Kartik
  8: 40, // Mangsir
  9: 41, // Poush
  10: 42, // Magh
  11: 43, // Falgun
  12: 44, // Chaitra
}

// Year IDs in AMPIS (node reference IDs)
const YEAR_IDS: Record<number, number> = {
  2080: 16,
  2081: 446538,
  2082: 894719,
  2083: 1614822,
}

// All AMPIS product IDs (170 items, all categories)
const AMPIS_PRODUCTS: Array<{ id: string; nameNe: string }> = [
  { id: '409', nameNe: 'गोलभेंडा ठुलो (नेपाली)' },
  { id: '410', nameNe: 'गोलभेंडा ठुलो (भारतीय)' },
  { id: '407', nameNe: 'गोलभेंडा सानो (लोकल)' },
  { id: '412', nameNe: 'गोलभेंडा सानो (टनेल)' },
  { id: '3564', nameNe: 'गोलभेंडा सानो (भारतीय)' },
  { id: '3565', nameNe: 'गोलभेंडा सानो (तराई)' },
  { id: '1694654', nameNe: 'रातो आलु (लाम्चो)' },
  { id: '1694655', nameNe: 'रातो आलु (गोलो)' },
  { id: '378', nameNe: 'आलु रातो (मुढे)' },
  { id: '376', nameNe: 'आलु रातो (भारतीय)' },
  { id: '379', nameNe: 'आलु सेतो' },
  { id: '436', nameNe: 'प्याज सुकेको (भारतीय)' },
  { id: '3566', nameNe: 'प्याज सुकेको (चाईनिज)' },
  { id: '1694656', nameNe: 'प्याज सुकेको (नेपाली)' },
  { id: '396', nameNe: 'गाँजर (लोकल)' },
  { id: '3567', nameNe: 'गाँजर (तराई)' },
  { id: '1694657', nameNe: 'गाँजर (नेपाली)' },
  { id: '402', nameNe: 'बन्दा (लोकल)' },
  { id: '401', nameNe: 'बन्दा (तराई)' },
  { id: '3568', nameNe: 'बन्दा (नरिवल)' },
  { id: '399', nameNe: 'काउली (स्थानीय)' },
  { id: '400', nameNe: 'काउली स्थानीय (ज्यापू)' },
  { id: '398', nameNe: 'काउली (तराई)' },
  { id: '432', nameNe: 'मूला रातो' },
  { id: '433', nameNe: 'मूला सेतो (लोकल)' },
  { id: '434', nameNe: 'मूला सेतो (हाइब्रिड)' },
  { id: '445', nameNe: 'भन्टा लाम्चो' },
  { id: '446', nameNe: 'भन्टा डल्लो' },
  { id: '390', nameNe: 'बोडी (तने)' },
  { id: '391', nameNe: 'मकै बोडी' },
  { id: '1731606', nameNe: 'बोडी (रातो)' },
  { id: '392', nameNe: 'मटरकोशा' },
  { id: '383', nameNe: 'घिउ सिमी (लोकल)' },
  { id: '384', nameNe: 'घिउ सिमी (हाइब्रिड)' },
  { id: '3569', nameNe: 'घिउ सिमी (राजमा)' },
  { id: '381', nameNe: 'टाटे सिमी' },
  { id: '388', nameNe: 'भटमास' },
  { id: '425', nameNe: 'तितो करेला' },
  { id: '438', nameNe: 'लौका' },
  { id: '447', nameNe: 'परवर (लोकल)' },
  { id: '448', nameNe: 'परवर (तराई)' },
  { id: '441', nameNe: 'चिचिण्डो' },
  { id: '442', nameNe: 'घिरौंला' },
  { id: '443', nameNe: 'झिगूनी' },
  { id: '421', nameNe: 'फर्सी पाकेको' },
  { id: '423', nameNe: 'फर्सी हरियो (लाम्चो)' },
  { id: '424', nameNe: 'फर्सी हरियो (डल्लो)' },
  { id: '450', nameNe: 'सलगम' },
  { id: '426', nameNe: 'भिण्डी' },
  { id: '380', nameNe: 'सखरखण्ड' },
  { id: '458', nameNe: 'बरेला' },
  { id: '3570', nameNe: 'पिण्डालु' },
  { id: '440', nameNe: 'स्कूस' },
  { id: '528', nameNe: 'रायो साग' },
  { id: '529', nameNe: 'पालुङ्गो साग' },
  { id: '531', nameNe: 'चम्सुरको साग' },
  { id: '532', nameNe: 'तोरीको साग' },
  { id: '535', nameNe: 'मेथीको साग' },
  { id: '428', nameNe: 'प्याज हरियो' },
  { id: '385', nameNe: 'बकुला' },
  { id: '377', nameNe: 'तरुल' },
  { id: '393', nameNe: 'च्याउ (कन्ये)' },
  { id: '394', nameNe: 'च्याउ (डल्ले)' },
  { id: '1694658', nameNe: 'राजा च्याउ' },
  { id: '1694659', nameNe: 'सितके च्याउ' },
  { id: '451', nameNe: 'कुरीलो' },
  { id: '526', nameNe: 'न्यूरो' },
  { id: '420', nameNe: 'ब्रोकाउली' },
  { id: '464', nameNe: 'चुकन्दर' },
  { id: '452', nameNe: 'सजिवन' },
  { id: '527', nameNe: 'कोइरालो' },
  { id: '418', nameNe: 'बन्दा रातो' },
  { id: '533', nameNe: 'जिरीको साग' },
  { id: '430', nameNe: 'ग्याठ कोबी' },
  { id: '537', nameNe: 'सेलरी' },
  { id: '538', nameNe: 'पार्सले' },
  { id: '536', nameNe: 'सौफको साग' },
  { id: '539', nameNe: 'पुदिना' },
  { id: '435', nameNe: 'गान्टे मूला' },
  { id: '387', nameNe: 'हरियो मकै' },
  { id: '453', nameNe: 'इमली' },
  { id: '454', nameNe: 'तामा' },
  { id: '3571', nameNe: 'तोफु' },
  { id: '455', nameNe: 'गुन्द्रुक' },
  { id: '444', nameNe: 'रुख टमाटर' },
  { id: '494', nameNe: 'स्याउ (झोले)' },
  { id: '495', nameNe: 'स्याउ (फूजी)' },
  { id: '1694660', nameNe: 'स्याउ (मुस्ताङ्ग)' },
  { id: '1694661', nameNe: 'स्याउ (जुम्ला)' },
  { id: '1694662', nameNe: 'स्याउ (चकलेटी)' },
  { id: '1694663', nameNe: 'केरा (नेपाली)' },
  { id: '10252', nameNe: 'केरा (मालभोग)' },
  { id: '10253', nameNe: 'केरा (हरियो)' },
  { id: '1694664', nameNe: 'केरा (भारतीय)' },
  { id: '439', nameNe: 'कागती' },
  { id: '465', nameNe: 'अनार' },
  { id: '480', nameNe: 'आँप (मालदह)' },
  { id: '481', nameNe: 'आँप (दसहरी)' },
  { id: '492', nameNe: 'आँप (चौसा)' },
  { id: '493', nameNe: 'आँप (कलकत्ते)' },
  { id: '1694665', nameNe: 'आँप (बम्बे)' },
  { id: '488', nameNe: 'अंगुर (हरियो)' },
  { id: '502', nameNe: 'अंगुर (कालो)' },
  { id: '498', nameNe: 'सुन्तला (नेपाली)' },
  { id: '499', nameNe: 'सुन्तला (भारतीय)' },
  { id: '3572', nameNe: 'तर्बुजा (हरियो)' },
  { id: '3573', nameNe: 'तर्बुजा (पाटे)' },
  { id: '487', nameNe: 'मौसम' },
  { id: '503', nameNe: 'जुनार' },
  { id: '472', nameNe: 'भुँईकटहर' },
  { id: '404', nameNe: 'काँक्रो (लोकल)' },
  { id: '406', nameNe: 'काँक्रो (हाइब्रिड)' },
  { id: '1694666', nameNe: 'काँक्रो (स्थानीय क्रस)' },
  { id: '471', nameNe: 'रुख कटहर' },
  { id: '466', nameNe: 'निबुवा' },
  { id: '467', nameNe: 'चाक्सी' },
  { id: '479', nameNe: 'नास्पाती (लोकल)' },
  { id: '501', nameNe: 'नास्पाती (चाईनिज)' },
  { id: '483', nameNe: 'मेवा (नेपाली)' },
  { id: '474', nameNe: 'मेवा (भारतीय)' },
  { id: '470', nameNe: 'अम्बा' },
  { id: '478', nameNe: 'लप्सी' },
  { id: '484', nameNe: 'लिच्ची (लोकल)' },
  { id: '485', nameNe: 'लिच्ची (भारतीय)' },
  { id: '473', nameNe: 'खर्बुजा' },
  { id: '476', nameNe: 'उखु' },
  { id: '534', nameNe: 'किनु' },
  { id: '413', nameNe: 'स्ट्रबेरी' },
  { id: '486', nameNe: 'किवि' },
  { id: '386', nameNe: 'शरिफा' },
  { id: '477', nameNe: 'आभोकाडो' },
  { id: '463', nameNe: 'अमला' },
  { id: '10254', nameNe: 'नरिवल (काँचो)' },
  { id: '10255', nameNe: 'नरिवल (हरियो)' },
  { id: '1694667', nameNe: 'ड्रागन फ्रुट (नेपाली)' },
  { id: '1694668', nameNe: 'ड्रागन फ्रुट (भारतीय)' },
  { id: '1694669', nameNe: 'बयर (नेपाली)' },
  { id: '1694670', nameNe: 'बयर (भारतीय)' },
  { id: '511', nameNe: 'अदुवा' },
  { id: '506', nameNe: 'सुकेको खुर्सानी' },
  { id: '1694671', nameNe: 'खुर्सानी हरियो (लाम्चो)' },
  { id: '414', nameNe: 'खुर्सानी हरियो (बुलेट)' },
  { id: '415', nameNe: 'खुर्सानी हरियो (माछे)' },
  { id: '416', nameNe: 'खुर्सानी हरियो (अकबरे)' },
  { id: '417', nameNe: 'भेडे खुर्सानी' },
  { id: '429', nameNe: 'हरियो लसुन' },
  { id: '540', nameNe: 'हरियो धनिया' },
  { id: '509', nameNe: 'सुकेको चाईनिज लसुन' },
  { id: '510', nameNe: 'सुकेको नेपाली लसुन' },
  { id: '1731607', nameNe: 'सुकेको लसुन (भारतीय)' },
  { id: '456', nameNe: 'सुकेको छ्यापी' },
  { id: '457', nameNe: 'हरियो छ्यापी' },
  { id: '504', nameNe: 'मरिच' },
  { id: '514', nameNe: 'सुकमेल' },
  { id: '505', nameNe: 'अलैंची' },
  { id: '508', nameNe: 'जिरा' },
  { id: '521', nameNe: 'सुकेको माछा' },
  { id: '516', nameNe: 'ताजा माछा (रहु)' },
  { id: '517', nameNe: 'ताजा माछा (बचुवा)' },
  { id: '519', nameNe: 'ताजा माछा (छड़ी)' },
  { id: '523', nameNe: 'कुखुराको मासु (बोईलर)' },
  { id: '524', nameNe: 'कुखुराको मासु (लोकल)' },
  { id: '525', nameNe: 'खसीको मासु' },
  { id: '512', nameNe: 'बंगुरको मासु' },
  { id: '507', nameNe: 'गाईको दुध' },
  { id: '389', nameNe: 'भैंसीको दुध' },
  { id: '460', nameNe: 'घ्यु' },
  { id: '449', nameNe: 'पनिर' },
  { id: '459', nameNe: 'छुर्पी' },
  { id: '530', nameNe: 'मखन' },
]

// Convert BS date to AD date
function bsToAd(bsYear: number, bsMonth: number, bsDay: number): Date | null {
  const yearData = BS_YEAR_DATA[bsYear]
  if (!yearData) return null
  if (bsMonth < 1 || bsMonth > 12) return null
  const maxDay = yearData.months[bsMonth - 1]
  if (bsDay < 1 || bsDay > maxDay) return null

  let offset = bsDay - 1
  for (let m = 1; m < bsMonth; m++) {
    offset += yearData.months[m - 1]
  }

  const result = new Date(yearData.start)
  result.setDate(result.getDate() + offset)
  result.setHours(0, 0, 0, 0)
  return result
}

// Cache for market DB records (keyed by nameNe prefix)
const marketCache = new Map<string, string>() // Nepali name prefix → market DB id
const vegCache = new Map<string, string>()

// Parse market rows from block_4 HTML
function parseMarketRows(html: string): Array<{ marketNameNe: string; min: number; max: number; avg: number }> {
  const $ = cheerio.load(html)
  const rows: Array<{ marketNameNe: string; min: number; max: number; avg: number }> = []
  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 3) return
    const marketNameNe = $(tds[0]).text().trim().split(',')[0].trim()
    const min = parseFloat($(tds[1]).text().replace(/,/g, '').trim())
    const max = parseFloat($(tds[2]).text().replace(/,/g, '').trim())
    const avg = tds.length >= 4
      ? parseFloat($(tds[3]).text().replace(/,/g, '').trim())
      : (min + max) / 2
    if (!marketNameNe || isNaN(min) || isNaN(max) || min <= 0) return
    rows.push({ marketNameNe, min, max, avg: isNaN(avg) ? (min + max) / 2 : avg })
  })
  return rows
}

async function fetchProductDay(
  productId: string,
  bsYear: number,
  bsMonth: number,
  bsDay: number
): Promise<Array<{ marketNameNe: string; min: number; max: number; avg: number }>> {
  const yearId = YEAR_IDS[bsYear]
  const monthId = MONTH_IDS[bsMonth]
  if (!yearId || !monthId) return []

  const body = new URLSearchParams({
    view_name: 'bajar_price_list',
    view_display_id: 'block_4',
    field_market_rate_commodity_target_id_entityreference_filter: productId,
    field_market_rate_year_target_id_entityreference_filter: String(yearId),
    field_market_rate_month_target_id: String(monthId),
    field_market_rate_day_target_id: String(bsDay),
  })

  try {
    const res = await fetch('https://ampis.gov.np/views/ajax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)',
      },
      body: body.toString(),
    })
    if (!res.ok) return []
    const commands: Array<{ command: string; data?: string }> = await res.json()
    const insertCmd = commands.find((c) => c.command === 'insert' && (c.data?.length ?? 0) > 500)
    if (!insertCmd?.data) return []
    return parseMarketRows(insertCmd.data)
  } catch {
    return []
  }
}

async function getOrCreateMarket(nameNe: string): Promise<string | null> {
  if (marketCache.has(nameNe)) return marketCache.get(nameNe)!

  // Try to find market by nameNe (partial match)
  const market = await prisma.market.findFirst({
    where: { nameNe: { contains: nameNe } },
  })
  if (market) {
    marketCache.set(nameNe, market.id)
    return market.id
  }
  return null
}

async function getOrCreateVeg(nameNe: string): Promise<string> {
  if (vegCache.has(nameNe)) return vegCache.get(nameNe)!
  const veg = await prisma.vegetable.upsert({
    where: { nameNe },
    update: {},
    create: { nameNe, nameEn: nameNe, nameJa: nameNe, unit: 'kg' },
  })
  vegCache.set(nameNe, veg.id)
  return veg.id
}

async function processDay(bsYear: number, bsMonth: number, bsDay: number): Promise<number> {
  const adDate = bsToAd(bsYear, bsMonth, bsDay)
  if (!adDate) return 0

  // Skip future dates
  if (adDate > new Date()) return 0

  let totalSaved = 0
  const dateStr = adDate.toISOString().split('T')[0]
  const bsStr = `${bsYear}-${String(bsMonth).padStart(2, '0')}-${String(bsDay).padStart(2, '0')} BS (${dateStr} AD)`

  // Process products in batches of 5
  for (let i = 0; i < AMPIS_PRODUCTS.length; i += 5) {
    const batch = AMPIS_PRODUCTS.slice(i, i + 5)
    const results = await Promise.all(
      batch.map((p) => fetchProductDay(p.id, bsYear, bsMonth, bsDay))
    )

    for (let j = 0; j < batch.length; j++) {
      const product = batch[j]
      const marketRows = results[j]
      if (marketRows.length === 0) continue

      const vegId = await getOrCreateVeg(product.nameNe)

      for (const row of marketRows) {
        const marketId = await getOrCreateMarket(row.marketNameNe)
        if (!marketId) continue

        await prisma.priceRecord.upsert({
          where: { vegetableId_marketId_date: { vegetableId: vegId, marketId, date: adDate } },
          update: { minPrice: row.min, maxPrice: row.max, avgPrice: row.avg },
          create: { vegetableId: vegId, marketId, date: adDate, minPrice: row.min, maxPrice: row.max, avgPrice: row.avg },
        })
        totalSaved++
      }
    }

    await new Promise((r) => setTimeout(r, 200))
  }

  if (totalSaved > 0) {
    console.log(`${bsStr}: ${totalSaved} records`)
  }
  return totalSaved
}

async function main() {
  // Pre-warm caches
  const existingVegs = await prisma.vegetable.findMany({ select: { id: true, nameNe: true } })
  for (const v of existingVegs) vegCache.set(v.nameNe, v.id)

  const existingMarkets = await prisma.market.findMany({
    where: { source: 'ampis' },
    select: { id: true, nameNe: true },
  })
  for (const m of existingMarkets) {
    // Store by first word of nameNe (e.g., "बिर्तामोड" from "बिर्तामोड, झापा")
    marketCache.set(m.nameNe, m.id)
  }

  console.log(`Loaded ${vegCache.size} vegetables, ${marketCache.size} markets`)
  console.log('Starting AMPIS historical backfill (2080-2083 BS = ~2023-2026 AD)...\n')

  let totalRecords = 0

  for (const bsYear of [2080, 2081, 2082, 2083]) {
    const yearData = BS_YEAR_DATA[bsYear]
    console.log(`\n=== Year ${bsYear} BS ===`)

    for (let bsMonth = 1; bsMonth <= 12; bsMonth++) {
      const maxDay = yearData.months[bsMonth - 1]
      for (let bsDay = 1; bsDay <= maxDay; bsDay++) {
        try {
          const count = await processDay(bsYear, bsMonth, bsDay)
          totalRecords += count
        } catch (e) {
          console.error(`Error on ${bsYear}-${bsMonth}-${bsDay}: ${e}`)
        }
        // Small delay between days
        await new Promise((r) => setTimeout(r, 100))
      }
    }
  }

  console.log(`\nAMPIS backfill complete! ${totalRecords} records saved.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
