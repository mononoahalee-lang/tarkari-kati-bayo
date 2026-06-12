import type { Metadata } from 'next'
import Link from 'next/link'
import { hasLocale, getDictionary, locales } from '@/lib/i18n'
import type { Locale } from '@/types'
import { notFound } from 'next/navigation'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Tarkari Kati Bayo — तरकारी कति भयो？',
  description: 'Nepal vegetable market prices, like a stock exchange. Real-time prices from Kalimati and markets across Nepal.',
  manifest: '/manifest.json',
  themeColor: '#16a34a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tarkari Kati Bayo',
  },
}

const langLabels: Record<Locale, string> = {
  ne: 'ने',
  en: 'EN',
  ja: '日',
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const locale = lang as Locale
  const dict = await getDictionary(locale)

  return (
    <html lang={locale} className="h-full">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href={`/${locale}`} className="flex items-center gap-2">
              <span className="text-lg font-bold text-green-400">🥬</span>
              <span className="text-sm font-semibold tracking-tight text-zinc-100">Tarkari Kati Bayo</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href={`/${locale}`} className="text-zinc-400 hover:text-zinc-100 transition-colors">
                {dict.nav.home}
              </Link>
              <Link href={`/${locale}/news`} className="text-zinc-400 hover:text-zinc-100 transition-colors">
                {dict.nav.news}
              </Link>
              <div className="flex gap-1 rounded-md border border-zinc-700 p-0.5">
                {locales.map((l) => (
                  <Link
                    key={l}
                    href={`/${l}${lang !== l ? '' : ''}`}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                      l === locale
                        ? 'bg-green-600 text-white'
                        : 'text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {langLabels[l]}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        </header>
        <ServiceWorkerRegister />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-600">
          Data: Kalimati Market &amp; AMPIS — Nepal Agriculture
        </footer>
      </body>
    </html>
  )
}
