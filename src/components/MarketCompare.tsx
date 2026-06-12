'use client'

interface MarketPrice {
  marketId: string
  marketNameEn: string
  marketNameNe: string
  district: string
  minPrice: number
  maxPrice: number
  avgPrice: number
}

interface Props {
  data: MarketPrice[]
  locale: string
}

export default function MarketCompare({ data, locale }: Props) {
  if (data.length === 0) return null

  const maxPrice = Math.max(...data.map((d) => d.maxPrice))
  const sorted = [...data].sort((a, b) => a.avgPrice - b.avgPrice)

  return (
    <div className="space-y-2">
      {sorted.map((m) => {
        const barWidth = maxPrice > 0 ? (m.avgPrice / maxPrice) * 100 : 0
        const name = locale === 'ne' ? m.marketNameNe : m.marketNameEn
        return (
          <div key={m.marketId} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-300">{name}</span>
              <div className="flex gap-3 text-xs font-mono text-zinc-400">
                <span className="text-zinc-600">{m.minPrice}–{m.maxPrice}</span>
                <span className="font-medium text-zinc-100">{m.avgPrice.toFixed(2)}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-500"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
