const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function toDateStr(d: Date | string): string {
  return (typeof d === 'string' ? d : d.toISOString()).split('T')[0]
}

// Kalimati and AMPIS both update once daily; a record is considered fresh
// if it is dated today or yesterday. Anything older means the scraper
// missed an update and the price must not be shown as current.
export function isStaleDateStr(dateStr: string | null): boolean {
  if (!dateStr) return true
  const today = toDateStr(new Date())
  const yesterday = toDateStr(new Date(Date.now() - ONE_DAY_MS))
  return dateStr !== today && dateStr !== yesterday
}
