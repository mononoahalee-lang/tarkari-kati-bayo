import type { Locale, Dictionary } from '@/types'

export const locales: Locale[] = ['ne', 'en', 'ja']
export const defaultLocale: Locale = 'en'

export function hasLocale(lang: string): lang is Locale {
  return locales.includes(lang as Locale)
}

const dictionaries = {
  ne: () => import('@/dictionaries/ne.json').then((m) => m.default as Dictionary),
  en: () => import('@/dictionaries/en.json').then((m) => m.default as Dictionary),
  ja: () => import('@/dictionaries/ja.json').then((m) => m.default as Dictionary),
}

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]()
}
