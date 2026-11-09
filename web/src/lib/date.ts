/**
 * Business dates travel as ISO `yyyy-mm-dd` and are shown day-first: "09.11.2026". Formatting by
 * hand rather than with `Intl` keeps the screen identical in every browser locale (the SPA ships
 * two languages, and the test locale is fixed).
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}
