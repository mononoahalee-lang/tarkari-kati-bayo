import { hasLocale } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { toDateStr, isStaleDateStr } from '@/lib/freshness'
import TomatoCharts, { type TomatoSeries } from '@/components/TomatoCharts'

export const revalidate = 43200

// ── Tomato classification ────────────────────────────────────────────────────
type Category = 'nepali' | 'indian' | 'tunnel' | 'terai' | 'tree'

function classify(nameEn: string): Category {
  const n = nameEn.toLowerCase()
  if (n.includes('tree') || n.includes('tamarillo')) return 'tree'
  if (n.includes('indian')) return 'indian'
  if (n.includes('tunnel')) return 'tunnel'
  if (n.includes('terai')) return 'terai'
  return 'nepali'
}

const CAT_META: Record<Category, {
  emoji: string
  label: Record<Locale, string>
  border: string
  bg: string
  text: string
  chartColor: string
}> = {
  nepali: { emoji: '🇳🇵', label: { en: 'Nepali / Local', ja: 'ネパール・地元産', ne: 'नेपाली / स्थानीय' }, border: 'border-green-700', bg: 'bg-green-900/20', text: 'text-green-300', chartColor: '#22c55e' },
  indian: { emoji: '🇮🇳', label: { en: 'Indian Import', ja: 'インド輸入', ne: 'भारतीय आयात' }, border: 'border-orange-700', bg: 'bg-orange-900/20', text: 'text-orange-300', chartColor: '#f97316' },
  tunnel: { emoji: '🏠', label: { en: 'Tunnel / Greenhouse', ja: 'トンネル栽培', ne: 'टनेल खेती' }, border: 'border-blue-700', bg: 'bg-blue-900/20', text: 'text-blue-300', chartColor: '#3b82f6' },
  terai: { emoji: '🌾', label: { en: 'Terai', ja: 'タライ産', ne: 'तराई' }, border: 'border-yellow-700', bg: 'bg-yellow-900/20', text: 'text-yellow-300', chartColor: '#eab308' },
  tree:   { emoji: '🌳', label: { en: 'Tree Tomato', ja: 'ツリートマト', ne: 'रुख टमाटर' }, border: 'border-purple-700', bg: 'bg-purple-900/20', text: 'text-purple-300', chartColor: '#a855f7' },
}

// Each category gets a cycling sub-shade if more than one variety per category
const EXTRA_COLORS: Record<Category, string[]> = {
  nepali: ['#22c55e', '#4ade80', '#86efac'],
  indian: ['#f97316', '#fb923c', '#fdba74'],
  tunnel: ['#3b82f6', '#60a5fa'],
  terai:  ['#eab308', '#facc15'],
  tree:   ['#a855f7', '#c084fc'],
}

// ── Data fetching ────────────────────────────────────────────────────────────
async function getTomatoVarieties() {
  const since365 = new Date(Date.now() - 365 * 86400000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)

  const tomatoes = await prisma.vegetable.findMany({
    where: { nameEn: { contains: 'Tomato', mode: 'insensitive' } },
    select: { id: true, nameEn: true, nameNe: true, nameJa: true, unit: true },
  })
  const ids = tomatoes.map((t) => t.id)

  const [latestPrices, prevPrices, marketCounts] = await Promise.all([
    prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number; date: Date }>>`
      SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice"::float, "date"
      FROM "PriceRecord"
      WHERE "vegetableId" = ANY(${ids}::text[]) AND "date" >= ${since365}
      ORDER BY "vegetableId", "date" DESC
    `,
    prisma.$queryRaw<Array<{ vegetableId: string; avgPrice: number }>>`
      SELECT DISTINCT ON ("vegetableId") "vegetableId", "avgPrice"::float
      FROM "PriceRecord"
      WHERE "vegetableId" = ANY(${ids}::text[]) AND "date" <= ${sevenDaysAgo}
      ORDER BY "vegetableId", "date" DESC
    `,
    prisma.$queryRaw<Array<{ vegetableId: string; cnt: number }>>`
      SELECT "vegetableId", COUNT(DISTINCT "marketId")::int AS cnt
      FROM "PriceRecord"
      WHERE "vegetableId" = ANY(${ids}::text[]) AND "date" >= ${since365}
      GROUP BY "vegetableId"
    `,
  ])

  const latestMap = new Map(latestPrices.map((r) => [r.vegetableId, { price: Number(r.avgPrice), date: toDateStr(r.date) }]))
  const prevMap   = new Map(prevPrices.map((r) => [r.vegetableId, Number(r.avgPrice)]))
  const mktMap    = new Map(marketCounts.map((r) => [r.vegetableId, r.cnt]))

  // Assign chart colors per-category
  const catCount: Partial<Record<Category, number>> = {}

  return tomatoes
    .filter((t) => latestMap.has(t.id))
    .map((t) => {
      const latest  = latestMap.get(t.id)!
      const prev    = prevMap.get(t.id) ?? null
      const isStale = isStaleDateStr(latest.date)
      const changePct = !isStale && prev && prev > 0 ? ((latest.price - prev) / prev) * 100 : null
      const cat = classify(t.nameEn)
      const idx = catCount[cat] ?? 0
      catCount[cat] = idx + 1
      return {
        id: t.id,
        nameEn: t.nameEn,
        nameNe: t.nameNe,
        nameJa: t.nameJa,
        unit: t.unit,
        avgPrice: latest.price,
        latestDate: latest.date,
        isStale,
        changePct,
        marketCount: mktMap.get(t.id) ?? 0,
        category: cat,
        chartColor: (EXTRA_COLORS[cat] ?? ['#ef4444'])[idx % (EXTRA_COLORS[cat]?.length ?? 1)],
      }
    })
    .sort((a, b) => {
      // Sort order: tree first (special), then nepali, terai, tunnel, indian
      const order: Category[] = ['tree', 'nepali', 'terai', 'tunnel', 'indian']
      return order.indexOf(a.category) - order.indexOf(b.category)
    })
}

async function getMarketMatrix(ids: string[]) {
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000)
  const rows = await prisma.$queryRaw<Array<{
    vegetableId: string; marketId: string; mktEn: string; mktNe: string
    avgPrice: number; date: string
  }>>`
    SELECT DISTINCT ON (p."vegetableId", p."marketId")
      p."vegetableId", p."marketId",
      m."nameEn" AS "mktEn", m."nameNe" AS "mktNe",
      p."avgPrice"::float, p.date::text
    FROM "PriceRecord" p
    JOIN "Market" m ON m.id = p."marketId"
    WHERE p."vegetableId" = ANY(${ids}::text[])
      AND p.date >= ${threeDaysAgo}
    ORDER BY p."vegetableId", p."marketId", p.date DESC
  `
  return rows
}

// ── Inline SVG Tomato illustration ──────────────────────────────────────────
function TomatoSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M60 44 C56 32 52 22 48 16 C50 24 54 34 60 44Z" fill="#22c55e"/>
      <path d="M60 44 C64 32 68 22 72 16 C70 24 66 34 60 44Z" fill="#16a34a"/>
      <path d="M60 44 C50 36 42 32 36 34 C42 36 50 38 60 44Z" fill="#22c55e"/>
      <path d="M60 44 C70 36 78 32 84 34 C78 36 70 38 60 44Z" fill="#16a34a"/>
      <path d="M60 44 C48 40 38 40 32 44 C40 42 50 42 60 44Z" fill="#15803d"/>
      <path d="M60 44 C72 40 82 40 88 44 C80 42 70 42 60 44Z" fill="#15803d"/>
      <path d="M60 16 C59 12 60 8 61 5" stroke="#15803d" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <circle cx="60" cy="90" r="46" fill="#ef4444"/>
      <path d="M22 102 Q40 136 60 138 Q80 136 98 102 Q60 116 22 102Z" fill="#dc2626" opacity="0.5"/>
      <path d="M60 44 Q65 90 63 136" stroke="#dc2626" strokeWidth="1.5" fill="none" opacity="0.4"/>
      <path d="M60 44 Q55 90 57 136" stroke="#dc2626" strokeWidth="1.5" fill="none" opacity="0.4"/>
      <path d="M60 44 Q73 82 87 128" stroke="#dc2626" strokeWidth="1.2" fill="none" opacity="0.25"/>
      <path d="M60 44 Q47 82 33 128" stroke="#dc2626" strokeWidth="1.2" fill="none" opacity="0.25"/>
      <ellipse cx="43" cy="68" rx="13" ry="8" fill="white" opacity="0.25" transform="rotate(-20 43 68)"/>
      <ellipse cx="45" cy="65" rx="4" ry="2.5" fill="white" opacity="0.5" transform="rotate(-20 45 65)"/>
    </svg>
  )
}

// ── UI strings ───────────────────────────────────────────────────────────────
const UI = {
  en: {
    back: '← Home',
    subtitle: 'All tomato varieties across Nepal markets · Price & trend analysis',
    statsVarieties: 'Varieties tracked',
    statsMarkets: 'Markets',
    statsAvg: 'Avg price today',
    statsAvgNote: 'Average of latest price per variety across all markets',
    indiaNepali: 'India 🇮🇳 vs Nepal 🇳🇵',
    indiaLabel: 'Indian tomatoes',
    nepaliLabel: 'Nepali / Local tomatoes',
    cheaperBy: 'cheaper',
    pricierBy: 'pricier',
    vs: 'vs',
    matrixTitle: 'Live Prices by Market',
    matrixNote: '(last 3 days · — = not traded here)',
    chartTitle: 'Price Trend',
    chartNote: 'Daily average across all reporting markets',
    stale: 'Data stopped',
    markets: 'markets',
    change7d: '7d change',
    viewChart: 'Chart →',
  },
  ja: {
    back: '← ホーム',
    subtitle: 'ネパール全市場のトマト全品種・価格と動向の総合分析',
    statsVarieties: '品種数',
    statsMarkets: '市場数',
    statsAvg: '本日の平均価格',
    statsAvgNote: '全市場の品種別最新価格の平均値',
    indiaNepali: 'インド産 🇮🇳 vs ネパール産 🇳🇵',
    indiaLabel: 'インド産トマト',
    nepaliLabel: 'ネパール・地元産トマト',
    cheaperBy: '安い',
    pricierBy: '高い',
    vs: 'と比較して',
    matrixTitle: '市場別ライブ価格',
    matrixNote: '（直近3日間 · — = 取り扱いなし）',
    chartTitle: '価格推移',
    chartNote: '各日の全市場平均価格（複数市場報告分）',
    stale: 'データ停止',
    markets: '市場',
    change7d: '7日変化',
    viewChart: 'チャート →',
  },
  ne: {
    back: '← गृहपृष्ठ',
    subtitle: 'नेपालका सबै बजारमा टमाटरका किसिमहरू · मूल्य र प्रवृत्ति विश्लेषण',
    statsVarieties: 'किसिमहरू',
    statsMarkets: 'बजारहरू',
    statsAvg: 'आजको औसत मूल्य',
    statsAvgNote: 'सबै बजारको किसिमगत औसत मूल्य',
    indiaNepali: 'भारत 🇮🇳 vs नेपाल 🇳🇵',
    indiaLabel: 'भारतीय टमाटर',
    nepaliLabel: 'नेपाली / स्थानीय टमाटर',
    cheaperBy: 'सस्तो',
    pricierBy: 'महँगो',
    vs: 'भन्दा',
    matrixTitle: 'बजारअनुसार ताजा मूल्य',
    matrixNote: '(अन्तिम ३ दिन · — = व्यापार छैन)',
    chartTitle: 'मूल्य प्रवृत्ति',
    chartNote: 'सबै बजारको दैनिक औसत (बहु-बजार दिन मात्र)',
    stale: 'डेटा रोकियो',
    markets: 'बजार',
    change7d: '७ दिन परिवर्तन',
    viewChart: 'चार्ट →',
  },
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function TomatoPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()
  const locale = lang as Locale
  const ui = UI[locale]

  const varieties = await getTomatoVarieties()
  const ids = varieties.map((v) => v.id)
  const matrixRows = await getMarketMatrix(ids)

  // Build market list from matrix
  const marketMap = new Map<string, { id: string; en: string; ne: string }>()
  for (const r of matrixRows) marketMap.set(r.marketId, { id: r.marketId, en: r.mktEn, ne: r.mktNe })
  const markets = [...marketMap.values()].sort((a, b) => a.en.localeCompare(b.en))

  // Matrix lookup: [vegId][mktId] = {price, stale}
  const matrix = new Map<string, Map<string, { price: number; stale: boolean }>>()
  for (const r of matrixRows) {
    if (!matrix.has(r.vegetableId)) matrix.set(r.vegetableId, new Map())
    matrix.get(r.vegetableId)!.set(r.marketId, {
      price: r.avgPrice,
      stale: isStaleDateStr(r.date.split('T')[0]),
    })
  }

  // India vs Nepal comparison
  const since7 = new Date(Date.now() - 7 * 86400000)
  const originRows = await prisma.$queryRaw<Array<{ origin: string; avg: number; cnt: number }>>`
    SELECT
      CASE WHEN lower(v."nameEn") LIKE '%indian%' THEN 'indian' ELSE 'local' END AS origin,
      AVG(p."avgPrice")::float AS avg, COUNT(*)::int AS cnt
    FROM "PriceRecord" p JOIN "Vegetable" v ON v.id = p."vegetableId"
    WHERE lower(v."nameEn") LIKE '%tomato%'
      AND NOT (lower(v."nameEn") LIKE '%tree%' OR lower(v."nameEn") LIKE '%tamarillo%')
      AND p.date >= ${since7}
    GROUP BY origin
  `
  const indianAvg = originRows.find((r) => r.origin === 'indian')?.avg ?? null
  const localAvg  = originRows.find((r) => r.origin === 'local')?.avg  ?? null
  const diffPct = indianAvg && localAvg ? ((indianAvg - localAvg) / localAvg) * 100 : null

  // Chart series (3-year multi-market history — client filters to chosen period)
  const since1095 = new Date(Date.now() - 1095 * 86400000)
  const histRows = await prisma.$queryRaw<Array<{ vegetableId: string; date: string; avgPrice: number }>>`
    SELECT p."vegetableId", p.date::text AS date, AVG(p."avgPrice")::float AS "avgPrice"
    FROM "PriceRecord" p
    WHERE p."vegetableId" = ANY(${ids}::text[])
      AND p.date >= ${since1095}
    GROUP BY p."vegetableId", p.date
    HAVING COUNT(DISTINCT p."marketId") >= 2
    ORDER BY p."vegetableId", p.date ASC
  `
  const histByVeg = new Map<string, Array<{ date: string; price: number }>>()
  for (const r of histRows) {
    if (!histByVeg.has(r.vegetableId)) histByVeg.set(r.vegetableId, [])
    histByVeg.get(r.vegetableId)!.push({ date: r.date.split('T')[0], price: Number(r.avgPrice) })
  }

  const chartSeries: TomatoSeries[] = varieties
    .filter((v) => histByVeg.has(v.id))
    .map((v) => ({
      id: v.id,
      nameEn: v.nameEn,
      nameJa: v.nameJa,
      nameNe: v.nameNe,
      color: v.chartColor,
      data: histByVeg.get(v.id)!,
    }))

  // Summary stats
  const freshVarieties = varieties.filter((v) => !v.isStale)
  const avgToday = freshVarieties.length
    ? freshVarieties.reduce((s, v) => s + v.avgPrice, 0) / freshVarieties.length
    : null

  // Group by category for the card grid
  const byCategory = new Map<Category, typeof varieties>()
  for (const v of varieties) {
    if (!byCategory.has(v.category)) byCategory.set(v.category, [])
    byCategory.get(v.category)!.push(v)
  }

  function getName(v: (typeof varieties)[0]) {
    return locale === 'ja' ? v.nameJa : locale === 'ne' ? v.nameNe : v.nameEn
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">

      {/* ── Hero ── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-red-950 via-red-900/80 to-zinc-900 border border-red-800/40 px-6 py-8">
        {/* Back link */}
        <Link href={`/${locale}`} className="absolute top-4 left-4 text-xs text-red-300/70 hover:text-red-200 transition-colors">
          {ui.back}
        </Link>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Text */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
              <span className="text-5xl">🍅</span>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  {locale === 'ja' ? 'トマト価格分析' : locale === 'ne' ? 'टमाटर मूल्य विश्लेषण' : 'Tomato Price Analysis'}
                </h1>
                <p className="text-sm text-red-200/70 mt-0.5">Tarkari Kati Bayo · Research Corner</p>
              </div>
            </div>
            <p className="text-sm text-red-100/60 max-w-lg">{ui.subtitle}</p>

            {/* Summary stat chips */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-5">
              <div className="rounded-xl bg-red-900/50 border border-red-700/40 px-4 py-2 text-center">
                <p className="text-2xl font-bold text-white">{varieties.length}</p>
                <p className="text-[11px] text-red-200/60">{ui.statsVarieties}</p>
              </div>
              <div className="rounded-xl bg-red-900/50 border border-red-700/40 px-4 py-2 text-center">
                <p className="text-2xl font-bold text-white">{markets.length}</p>
                <p className="text-[11px] text-red-200/60">{ui.statsMarkets}</p>
              </div>
              {avgToday && (
                <div className="rounded-xl bg-red-900/50 border border-red-700/40 px-4 py-2 text-center">
                  <p className="text-2xl font-bold text-white font-mono">NPR {avgToday.toFixed(0)}</p>
                  <p className="text-[11px] text-red-200/60">{ui.statsAvg}</p>
                  <p className="text-[10px] text-red-300/40 mt-0.5 max-w-[160px] leading-tight">{ui.statsAvgNote}</p>
                </div>
              )}
            </div>
          </div>

          {/* Illustration */}
          <div className="shrink-0 relative">
            <TomatoSVG className="w-28 h-28 sm:w-36 sm:h-36 drop-shadow-2xl" />
            {/* Decorative small tomatoes */}
            <span className="absolute -top-2 -right-2 text-2xl opacity-60 rotate-12">🍅</span>
            <span className="absolute -bottom-1 -left-3 text-xl opacity-40 -rotate-6">🍅</span>
          </div>
        </div>
      </div>

      {/* ── India vs Nepal comparison ── */}
      {indianAvg && localAvg && diffPct !== null && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
            <span className="text-lg">⚖️</span>
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">{ui.indiaNepali}</h2>
            <span className="text-xs text-zinc-500">{locale === 'ja' ? '直近7日間の平均' : locale === 'ne' ? 'अन्तिम ७ दिन' : 'Last 7-day avg'}</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-zinc-800">
            {/* Nepal */}
            <div className="p-5 text-center">
              <div className="text-3xl mb-2">🇳🇵</div>
              <p className="text-xs text-zinc-500 mb-1">{ui.nepaliLabel}</p>
              <p className="text-3xl font-bold font-mono text-green-400">NPR {localAvg.toFixed(0)}</p>
              {diffPct < 0 && (
                <span className="mt-2 inline-block rounded-full bg-green-900/40 border border-green-700/40 px-2 py-0.5 text-[11px] text-green-300">
                  {Math.abs(diffPct).toFixed(0)}% {ui.cheaperBy} ✓
                </span>
              )}
            </div>
            {/* India */}
            <div className="p-5 text-center">
              <div className="text-3xl mb-2">🇮🇳</div>
              <p className="text-xs text-zinc-500 mb-1">{ui.indiaLabel}</p>
              <p className="text-3xl font-bold font-mono text-orange-400">NPR {indianAvg.toFixed(0)}</p>
              {diffPct > 0 && (
                <span className="mt-2 inline-block rounded-full bg-orange-900/40 border border-orange-700/40 px-2 py-0.5 text-[11px] text-orange-300">
                  {diffPct.toFixed(0)}% {ui.pricierBy}
                </span>
              )}
            </div>
          </div>
          {/* Visual price bar comparison */}
          <div className="px-5 pb-5">
            <div className="relative h-3 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400"
                style={{ width: `${(localAvg / Math.max(localAvg, indianAvg)) * 100}%` }}
              />
            </div>
            <div className="relative h-3 rounded-full bg-zinc-800 overflow-hidden mt-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400"
                style={{ width: `${(indianAvg / Math.max(localAvg, indianAvg)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Variety cards by category ── */}
      <div className="space-y-6">
        {(['tree', 'nepali', 'terai', 'tunnel', 'indian'] as Category[])
          .filter((cat) => byCategory.has(cat))
          .map((cat) => {
            const catVars = byCategory.get(cat)!
            const meta = CAT_META[cat]
            return (
              <div key={cat}>
                {/* Category header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{meta.emoji}</span>
                  <h2 className={`text-sm font-bold uppercase tracking-wider ${meta.text}`}>
                    {meta.label[locale]}
                  </h2>
                  <span className="text-xs text-zinc-600">({catVars.length})</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {catVars.map((v) => (
                    <div
                      key={v.id}
                      className={`rounded-xl border ${meta.border} ${meta.bg} p-4 relative overflow-hidden group`}
                    >
                      {/* Decorative tomato watermark */}
                      <span className="absolute -right-2 -bottom-3 text-5xl opacity-5 select-none pointer-events-none">🍅</span>

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-100 text-sm leading-tight truncate">{getName(v)}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{v.nameEn}</p>
                        </div>
                        <Link
                          href={`/${locale}/vegetables/${v.id}`}
                          className={`shrink-0 text-[10px] font-medium ${meta.text} hover:underline`}
                        >
                          {ui.viewChart}
                        </Link>
                      </div>

                      <div className="mt-3 flex items-end justify-between">
                        <div>
                          <p className={`text-2xl font-bold font-mono ${v.isStale ? 'text-zinc-500' : 'text-zinc-100'}`}>
                            NPR {v.avgPrice.toFixed(0)}
                          </p>
                          <p className="text-[10px] text-zinc-500">/{v.unit}</p>
                        </div>
                        <div className="text-right">
                          {v.isStale ? (
                            <span className="text-[10px] text-amber-500">⚠ {ui.stale}<br/>{v.latestDate}</span>
                          ) : v.changePct !== null ? (
                            <span className={`text-sm font-bold font-mono ${v.changePct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {v.changePct >= 0 ? '↑' : '↓'} {Math.abs(v.changePct).toFixed(1)}%
                            </span>
                          ) : null}
                          <p className="text-[10px] text-zinc-600 mt-0.5">{v.marketCount} {ui.markets}</p>
                        </div>
                      </div>

                      {/* Mini bar gauge within 52w range */}
                      <div className="mt-2 h-0.5 rounded-full bg-zinc-800">
                        <div className="h-full rounded-full" style={{ width: '60%', backgroundColor: v.chartColor }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
      </div>

      {/* ── Market matrix ── */}
      {markets.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              🏪 {ui.matrixTitle}
            </h2>
            <p className="text-[11px] text-zinc-600 mt-0.5">{ui.matrixNote}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="px-3 py-2 text-left font-medium sticky left-0 bg-zinc-900 z-10 min-w-[140px]">
                    {locale === 'ja' ? '品種' : locale === 'ne' ? 'किसिम' : 'Variety'}
                  </th>
                  {markets.map((m) => (
                    <th key={m.id} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                      {locale === 'ne' ? m.ne : m.en}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {varieties
                  .filter((v) => matrix.has(v.id))
                  .map((v) => {
                    const vegMatrix = matrix.get(v.id)!
                    const prices = markets.map((m) => vegMatrix.get(m.id)?.price).filter((p): p is number => p !== undefined)
                    const minP = prices.length ? Math.min(...prices) : null
                    const maxP = prices.length ? Math.max(...prices) : null
                    const meta = CAT_META[v.category]
                    return (
                      <tr key={v.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-3 py-2 sticky left-0 bg-zinc-900 z-10">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">{meta.emoji}</span>
                            <div>
                              <p className="font-medium text-zinc-200 leading-tight">{getName(v)}</p>
                              {v.isStale && <span className="text-[9px] text-amber-500">⚠ stale</span>}
                            </div>
                          </div>
                        </td>
                        {markets.map((m) => {
                          const cell = vegMatrix.get(m.id)
                          if (!cell) return (
                            <td key={m.id} className="px-2 py-2 text-center text-zinc-700">—</td>
                          )
                          const isMin = minP !== null && cell.price === minP && prices.length > 1
                          const isMax = maxP !== null && cell.price === maxP && prices.length > 1
                          return (
                            <td key={m.id} className={`px-2 py-2 text-center font-mono ${
                              cell.stale ? 'text-zinc-600' :
                              isMin ? 'text-green-400 font-semibold' :
                              isMax ? 'text-red-400 font-semibold' :
                              'text-zinc-300'
                            }`}>
                              {cell.price.toFixed(0)}
                              {isMin && <span className="text-[8px] ml-0.5">▼</span>}
                              {isMax && <span className="text-[8px] ml-0.5">▲</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-zinc-600">
            🟢 = {locale === 'ja' ? '最安値' : locale === 'ne' ? 'सस्तो' : 'Cheapest'} &nbsp;
            🔴 = {locale === 'ja' ? '最高値' : locale === 'ne' ? 'महँगो' : 'Most expensive'} &nbsp;
            — = {locale === 'ja' ? '取扱なし' : locale === 'ne' ? 'डेटा छैन' : 'No data'}
          </p>
        </div>
      )}

      {/* ── Price trend chart (client) ── */}
      {chartSeries.length > 0 && (
        <div className="rounded-xl border border-red-900/30 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-900/20">
            <div className="flex items-center gap-2">
              <span className="text-lg">📈</span>
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">{ui.chartTitle}</h2>
            </div>
            <p className="text-[11px] text-zinc-600 mt-0.5">{ui.chartNote}</p>
          </div>
          <div className="p-4">
            <TomatoCharts series={chartSeries} locale={locale} />
          </div>
        </div>
      )}

      {/* ── Footer note ── */}
      <div className="text-center py-4 space-y-1">
        <p className="text-3xl">🍅🍅🍅</p>
        <p className="text-xs text-zinc-600">
          {locale === 'ja'
            ? 'データ出典: Kalimati Market (kalimatimarket.gov.np) · AMPIS Nepal Agriculture'
            : locale === 'ne'
            ? 'डेटा स्रोत: Kalimati Market · AMPIS नेपाल कृषि'
            : 'Data source: Kalimati Market (kalimatimarket.gov.np) · AMPIS Nepal Agriculture'}
        </p>
      </div>
    </div>
  )
}
