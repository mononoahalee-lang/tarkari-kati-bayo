import { prisma } from '@/lib/prisma'
import { hasLocale } from '@/lib/i18n'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // Last 30 scrape logs
  const logs = await prisma.scrapeLog.findMany({
    orderBy: { runAt: 'desc' },
    take: 30,
  })

  // Latest data date per market
  const marketStatus = await prisma.$queryRaw`
    SELECT m."nameEn", MAX(p.date)::text as latest,
      COUNT(DISTINCT p."vegetableId") FILTER (WHERE p.date >= NOW() - INTERVAL '3 days')::int as recent_veg
    FROM "PriceRecord" p
    JOIN "Market" m ON m.id = p."marketId"
    GROUP BY m."nameEn"
    ORDER BY MAX(p.date) DESC
  ` as Array<{ nameEn: string; latest: string; recent_veg: number }>

  // Stale vegetables: have data in last 365 days but not today/yesterday
  const staleVegetables = await prisma.$queryRaw`
    SELECT v."nameEn", v."nameNe", MAX(p.date)::text as latest_date,
      DATE_PART('day', NOW() - MAX(p.date))::int as days_old
    FROM "Vegetable" v
    JOIN "PriceRecord" p ON p."vegetableId" = v.id
    GROUP BY v.id, v."nameEn", v."nameNe"
    HAVING MAX(p.date)::text NOT IN (${today}, ${yesterday})
      AND MAX(p.date) >= NOW() - INTERVAL '365 days'
    ORDER BY MAX(p.date) DESC
    LIMIT 50
  ` as Array<{ nameEn: string; nameNe: string; latest_date: string; days_old: number }>

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Scraper Monitor</h1>

      {/* Market Data Status */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-300 mb-3">Market Data Status</h2>
        <div className="rounded-lg border border-zinc-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-2 text-left">Market</th>
                <th className="px-4 py-2 text-right">Latest Date</th>
                <th className="px-4 py-2 text-right">Recent Items (3d)</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {marketStatus.map((m) => {
                const latestDate = m.latest?.slice(0, 10) ?? ''
                const isOk = latestDate === today || latestDate === yesterday
                return (
                  <tr key={m.nameEn} className="border-t border-zinc-800">
                    <td className="px-4 py-2 font-medium">{m.nameEn}</td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-400">{latestDate}</td>
                    <td className="px-4 py-2 text-right font-mono">{m.recent_veg}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOk ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {isOk ? '✓ OK' : '⚠ Stale'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stale Vegetables */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-300 mb-1">Stale Vegetables ({staleVegetables.length})</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Has data in last 365 days, but not today or yesterday. Many are due to AMPIS renaming vegetables (June 2026).
        </p>
        {staleVegetables.length === 0 ? (
          <p className="text-green-400 text-sm">All vegetables have fresh data.</p>
        ) : (
          <div className="rounded-lg border border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Vegetable</th>
                  <th className="px-4 py-2 text-left">नेपाली</th>
                  <th className="px-4 py-2 text-right">Last Data</th>
                  <th className="px-4 py-2 text-right">Days Old</th>
                </tr>
              </thead>
              <tbody>
                {staleVegetables.map((v) => (
                  <tr key={v.nameEn} className="border-t border-zinc-800">
                    <td className="px-4 py-2 font-medium text-zinc-200">{v.nameEn}</td>
                    <td className="px-4 py-2 text-zinc-400">{v.nameNe}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-400">{v.latest_date}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        v.days_old <= 7 ? 'bg-yellow-900 text-yellow-300'
                        : v.days_old <= 30 ? 'bg-orange-900 text-orange-300'
                        : 'bg-red-900 text-red-300'
                      }`}>
                        {v.days_old}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Scrape Logs */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-300 mb-3">Scrape Logs (last 30)</h2>
        {logs.length === 0 ? (
          <p className="text-zinc-500 text-sm">No logs yet. Logs will appear after the next cron run.</p>
        ) : (
          <div className="rounded-lg border border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Run At (UTC)</th>
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2 text-left">Target Date</th>
                  <th className="px-4 py-2 text-right">Items</th>
                  <th className="px-4 py-2 text-center">Result</th>
                  <th className="px-4 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-zinc-800">
                    <td className="px-4 py-2 font-mono text-zinc-400 text-xs whitespace-nowrap">
                      {log.runAt.toISOString().replace('T', ' ').slice(0, 16)}
                    </td>
                    <td className="px-4 py-2 text-zinc-300">{log.source}</td>
                    <td className="px-4 py-2 font-mono text-zinc-400">{log.targetDate.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-2 text-right font-mono">{log.itemsCount}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${log.success ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {log.success ? '✓' : '✗'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-500 text-xs">{log.message ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
