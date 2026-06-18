import { scrapeKalimati } from './src/lib/scraper-kalimati'

const DAYS = parseInt(process.argv[2] ?? '30')

async function main() {
  console.log(`Backfilling Kalimati data for past ${DAYS} days...`)
  let totalSaved = 0

  for (let i = DAYS; i >= 1; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]

    try {
      const count = await scrapeKalimati(date)
      console.log(`${dateStr}: ${count} records`)
      totalSaved += count
    } catch (err) {
      console.error(`${dateStr}: failed — ${err}`)
    }

    // Small delay between requests to be polite
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Also get today
  try {
    const count = await scrapeKalimati()
    const today = new Date().toISOString().split('T')[0]
    console.log(`${today} (today): ${count} records`)
    totalSaved += count
  } catch (err) {
    console.error(`Today: failed — ${err}`)
  }

  console.log(`\nBackfill complete! Total records saved: ${totalSaved}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
