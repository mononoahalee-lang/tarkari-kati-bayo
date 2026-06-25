import { hasLocale, getDictionary } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function NewsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const locale = lang as Locale
  const dict = await getDictionary(locale)

  const news = await prisma.newsItem.findMany({
    orderBy: { publishedAt: 'desc' },
    take: 30,
  })

  const getTitle = (item: (typeof news)[0]) => {
    if (locale === 'ne' && item.titleNe) return item.titleNe
    if (locale === 'ja' && item.titleJa) return item.titleJa
    return item.titleEn
  }

  const refLabel = locale === 'ne' ? 'स्रोत' : locale === 'ja' ? '参照元' : 'Reference'
  const openLabel = locale === 'ne' ? 'खोल्नुहोस् ↗' : locale === 'ja' ? '開く ↗' : 'Open ↗'

  const getDomain = (url: string) => {
    try { return new URL(url).hostname.replace('www.', '') } catch { return url }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">{dict.news.title}</h1>
        <p className="text-xs text-zinc-500 mt-1">
          {locale === 'ne'
            ? 'AI द्वारा संकलित बजार समाचार। स्रोत लिंकमा मूल जानकारी पाइन्छ।'
            : locale === 'ja'
            ? 'AI生成の市場ニュース。参照元リンクで一次情報をご確認ください。'
            : 'AI-curated market news summaries. Visit reference links for primary sources.'}
        </p>
      </div>

      {news.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
          {dict.news.noNews}
        </div>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium text-zinc-100 leading-snug flex-1">
                  {getTitle(item)}
                </h2>
                <span className="shrink-0 text-xs text-zinc-500 whitespace-nowrap">{item.source}</span>
              </div>
              {item.summary && (
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed line-clamp-2">{item.summary}</p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-zinc-600">
                  {item.publishedAt.toISOString().split('T')[0]}
                </p>
                <a
                  href={item.url.split('?')[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  title={item.url.split('?')[0]}
                >
                  <span className="text-zinc-500">{refLabel}:</span>
                  <span className="font-medium">{getDomain(item.url)}</span>
                  <span>{openLabel}</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
