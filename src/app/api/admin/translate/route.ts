import { NextRequest, NextResponse } from 'next/server'
import { generateText } from '@/lib/gemini'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    const devanagariPattern = /[ऀ-ॿ]/
    const allVegs = await prisma.vegetable.findMany({
      select: { id: true, nameNe: true, nameEn: true, nameJa: true },
    })

    const needsTranslation = allVegs
      .filter((v) => devanagariPattern.test(v.nameEn) || devanagariPattern.test(v.nameJa ?? ''))
      .slice(0, 60)

    if (needsTranslation.length === 0) {
      return NextResponse.json({ message: 'All vegetables already translated', updated: 0 })
    }

    const nameList = needsTranslation.map((v, i) => `${i + 1}. ${v.nameNe}`).join('\n')

    const prompt = `Translate these Nepal vegetable/fruit/food market names from Nepali to English and Japanese.
Return ONLY a JSON array (no markdown):
[{"nameNe":"original","nameEn":"English name","nameJa":"日本語名"}]

Names to translate:
${nameList}`

    const text = await generateText(prompt)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'No JSON from Gemini', raw: text.slice(0, 500) }, { status: 500 })
    }

    const translations: Array<{ nameNe: string; nameEn: string; nameJa: string }> = JSON.parse(jsonMatch[0])

    let updated = 0
    for (const t of translations) {
      if (!t.nameNe || !t.nameEn) continue
      const veg = needsTranslation.find((v) => v.nameNe === t.nameNe)
      if (!veg) continue
      await prisma.vegetable.update({
        where: { id: veg.id },
        data: {
          nameEn: t.nameEn,
          nameJa: t.nameJa || t.nameEn,
        },
      })
      updated++
    }

    return NextResponse.json({ message: 'Translation complete', updated, total: needsTranslation.length })
  } catch (error) {
    console.error('Translate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
