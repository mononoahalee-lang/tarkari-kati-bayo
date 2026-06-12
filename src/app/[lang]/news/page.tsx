import { hasLocale, getDictionary } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const revalidate = 3600

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">{dict.news.title}</h1>

      {news.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
          {dict.news.noNews}
        </div>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium text-zinc-100 leading-snug group-hover:text-green-400">
                  {getTitle(item)}
                </h2>
                <span className="shrink-0 text-xs text-zinc-500">{item.source}</span>
              </div>
              {item.summary && (
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed line-clamp-2">{item.summary}</p>
              )}
              <p className="mt-2 text-xs text-zinc-600">
                {item.publishedAt.toISOString().split('T')[0]}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
