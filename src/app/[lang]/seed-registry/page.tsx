import { hasLocale } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import SeedRegistryExplorer, { type SeedVarietyRow } from '@/components/SeedRegistryExplorer'

export const revalidate = 21600 // 6h — registry data changes slowly, synced daily by cron

const UI = {
  en: {
    back: '← Home',
    title: 'Seed Variety Register',
    subtitle: 'SQCC Nepal’s official registered crop varieties — who bred it, is it registered, where it’s recommended.',
    lastSync: 'Data last synced',
    source: 'Source: SQCC public API (seed.sqcc.gov.np) — synced daily.',
  },
  ja: {
    back: '← ホーム',
    title: '種子品種登録',
    subtitle: 'ネパールSQCC公式の登録品種一覧 — 育成者、登録有無、推奨栽培地域。',
    lastSync: '最終同期',
    source: 'データ出典: SQCC公開API (seed.sqcc.gov.np) — 毎日自動同期',
  },
  ne: {
    back: '← गृहपृष्ठ',
    title: 'बीउ किसिम दर्ता',
    subtitle: 'SQCC नेपालको आधिकारिक दर्ता भएका बालीका किसिमहरू — कसले विकास गर्‍यो, दर्ता भए/नभएको, सिफारिस क्षेत्र।',
    lastSync: 'अन्तिम समकालीकरण',
    source: 'स्रोत: SQCC सार्वजनिक API (seed.sqcc.gov.np) — दैनिक समकालीकरण',
  },
}

async function getData() {
  const rows = await prisma.seedVariety.findMany({
    select: {
      id: true, name: true, nepName: true, cropName: true, cropSlug: true,
      ownerType: true, typeOpHybrid: true, isRegistered: true, releasedDate: true,
      releasedFiscalYear: true, recommendedAreas: true, updatedAt: true,
    },
  })

  const cropCounts = new Map<string, number>()
  for (const r of rows) cropCounts.set(r.cropName, (cropCounts.get(r.cropName) ?? 0) + 1)
  const crops = [...cropCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.name === 'Rice') return -1
      if (b.name === 'Rice') return 1
      return b.count - a.count
    })

  const data: SeedVarietyRow[] = rows.map((r) => ({
    id: r.id,
    n: r.name,
    nn: r.nepName ?? '',
    c: r.cropName,
    cs: r.cropSlug,
    o: r.ownerType,
    t: r.typeOpHybrid,
    reg: r.isRegistered,
    rd: r.releasedDate ? r.releasedDate.toISOString().split('T')[0] : null,
    fy: r.releasedFiscalYear,
    area: r.recommendedAreas,
  }))

  const lastSync = rows.reduce<Date | null>((max, r) => (!max || r.updatedAt > max ? r.updatedAt : max), null)

  return { data, crops, lastSync }
}

export default async function SeedRegistryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()
  const locale = lang as Locale
  const ui = UI[locale]

  const { data, crops, lastSync } = await getData()

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-teal-950 via-zinc-900 to-zinc-900 border border-teal-800/30 px-6 py-7">
        <Link href={`/${locale}`} className="absolute top-4 left-4 text-xs text-teal-300/70 hover:text-teal-200 transition-colors">
          {ui.back}
        </Link>
        <div className="text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3 mb-1">
            <span className="text-4xl">🌾</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{ui.title}</h1>
          </div>
          <p className="text-sm text-teal-100/60 max-w-xl mx-auto sm:mx-0">{ui.subtitle}</p>
          {lastSync && (
            <p className="text-[11px] text-teal-300/40 mt-2">
              {ui.lastSync}: {lastSync.toISOString().split('T')[0]}
            </p>
          )}
        </div>
      </div>

      <SeedRegistryExplorer data={data} crops={crops} locale={locale} />

      <p className="text-center text-[11px] text-zinc-600 py-2">{ui.source}</p>
    </div>
  )
}
