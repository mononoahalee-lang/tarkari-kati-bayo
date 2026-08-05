import { notFound } from 'next/navigation'
import { hasLocale, getDictionary } from '@/lib/i18n'
import type { Locale } from '@/types'

export const dynamic = 'force-dynamic'

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  if (!hasLocale(lang)) notFound()

  // Fail closed: an unset SURVEY_ACCESS_SLUG must never be treated as open access.
  const accessSlug = process.env.SURVEY_ACCESS_SLUG
  if (!accessSlug || slug !== accessSlug) notFound()

  const locale = lang as Locale
  const dict = await getDictionary(locale)
  const formUrl = process.env.KOBO_FORM_URL

  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center space-y-6">
      <h1 className="text-2xl font-bold text-white">{dict.survey.title}</h1>
      <p className="text-sm text-zinc-400">{dict.survey.description}</p>

      {formUrl ? (
        <a
          href={formUrl}
          className="inline-block w-full rounded-lg bg-green-600 hover:bg-green-500 px-6 py-3 text-sm font-semibold text-white transition-colors"
        >
          {dict.survey.openForm}
        </a>
      ) : (
        <p className="text-sm text-yellow-500/90 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          {dict.survey.notReady}
        </p>
      )}
    </div>
  )
}
