import { prisma } from './src/lib/prisma'
import { generateText } from './src/lib/gemini'

async function main() {
  const devanagariPattern = /[ऀ-ॿ]/

  const allVegs = await prisma.vegetable.findMany({
    select: { id: true, nameNe: true, nameEn: true, nameJa: true },
  })

  const needsTranslation = allVegs.filter(
    (v) => devanagariPattern.test(v.nameEn) || devanagariPattern.test(v.nameJa ?? '')
  )

  console.log(`Found ${needsTranslation.length} vegetables needing translation`)
  if (needsTranslation.length === 0) { console.log('All done!'); return }

  // Process in batches of 50
  const batchSize = 50
  let totalUpdated = 0

  for (let i = 0; i < needsTranslation.length; i += batchSize) {
    const batch = needsTranslation.slice(i, i + batchSize)
    const nameList = batch.map((v, j) => `${j + 1}. ${v.nameNe}`).join('\n')

    const prompt = `Translate these Nepal vegetable/fruit/food market item names from Nepali to English and Japanese.
Return ONLY a JSON array (no markdown, no code block):
[{"nameNe":"original Nepali","nameEn":"English name","nameJa":"日本語名"}]

Names:
${nameList}`

    console.log(`Translating batch ${Math.floor(i / batchSize) + 1} (${batch.length} items)...`)
    const text = await generateText(prompt)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) { console.error('No JSON in response:', text.slice(0, 200)); continue }

    const translations: Array<{ nameNe: string; nameEn: string; nameJa: string }> = JSON.parse(jsonMatch[0])

    for (const t of translations) {
      const veg = batch.find((v) => v.nameNe === t.nameNe)
      if (!veg || !t.nameEn) continue
      await prisma.vegetable.update({
        where: { id: veg.id },
        data: { nameEn: t.nameEn, nameJa: t.nameJa || t.nameEn },
      })
      totalUpdated++
    }
    console.log(`  Updated ${totalUpdated} so far`)
  }

  console.log(`Translation complete! Total updated: ${totalUpdated}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
