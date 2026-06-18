import { scrapeKalimati } from './src/lib/scraper-kalimati'
import { scrapeAmpis } from './src/lib/scraper-ampis'

async function main() {
  console.log('Scraping Kalimati...')
  const k = await scrapeKalimati()
  console.log(`Kalimati: ${k} records`)

  console.log('Scraping AMPIS (11 markets)...')
  const a = await scrapeAmpis()
  console.log(`AMPIS: ${a} records`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
