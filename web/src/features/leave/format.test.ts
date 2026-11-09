import { describe, expect, it } from 'vitest'

import { formatDays, halfDayKey } from './format'

/**
 * The day unit is decimal from B1 on (D16): a half day reads "0,5" in Turkish and "0.5" in English,
 * and a whole day keeps no trailing zero. Every fractional assertion elsewhere runs in the default
 * Turkish locale, so the English branch is pinned here too (review T-6).
 */
describe('formatDays', () => {
  it('shows a half day in the catalogue locale', () => {
    expect(formatDays(0.5, 'tr')).toBe('0,5')
    expect(formatDays(0.5, 'en')).toBe('0.5')
    expect(formatDays(13.5, 'tr')).toBe('13,5')
    expect(formatDays(13.5, 'en')).toBe('13.5')
  })

  it('keeps a whole day whole', () => {
    expect(formatDays(14, 'tr')).toBe('14')
    expect(formatDays(14, 'en')).toBe('14')
    expect(formatDays(0, 'tr')).toBe('0')
  })
})

describe('halfDayKey', () => {
  it('maps every selection to its own label', () => {
    expect(halfDayKey('NONE')).toBe('halfDayNone')
    expect(halfDayKey('AM')).toBe('halfDayAm')
    expect(halfDayKey('PM')).toBe('halfDayPm')
  })
})
