import { describe, expect, it } from 'vitest'

import { ApiError } from '@/features/auth/authApi'
import {
  formatDays,
  halfDayKey,
  kinshipKey,
  leaveErrorKey,
  leaveTypeHints,
  leaveTypeKey,
} from './format'

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

describe('special leave mapping', () => {
  it('maps every type to its own label and hint', () => {
    expect(leaveTypeKey('ANNUAL')).toBe('leaveTypeAnnual')
    expect(leaveTypeKey('EXCUSE')).toBe('leaveTypeExcuse')
    expect(leaveTypeKey('MARRIAGE')).toBe('leaveTypeMarriage')
    expect(leaveTypeKey('BEREAVEMENT')).toBe('leaveTypeBereavement')
    expect(leaveTypeKey('SPOUSE_BIRTH')).toBe('leaveTypeSpouseBirth')
    expect(leaveTypeKey('SCHOOL_REPORT')).toBe('leaveTypeSchoolReport')
    expect(leaveTypeKey('BIRTHDAY')).toBe('leaveTypeBirthday')
    expect(leaveTypeKey('FIRST_SCHOOL_DAY')).toBe('leaveTypeFirstSchoolDay')

    expect(leaveTypeHints('MARRIAGE')).toEqual(['leaveHintFiveDays'])
    expect(leaveTypeHints('BEREAVEMENT')).toEqual(['leaveHintFiveDays'])
    expect(leaveTypeHints('SPOUSE_BIRTH')).toEqual(['leaveHintFiveDays'])
    expect(leaveTypeHints('SCHOOL_REPORT')).toEqual(['leaveHintOneDay', 'leaveHintSchoolAgeChild'])
    expect(leaveTypeHints('FIRST_SCHOOL_DAY')).toEqual([
      'leaveHintOneDay',
      'leaveHintSchoolAgeChild',
    ])
    expect(leaveTypeHints('BIRTHDAY')).toEqual(['leaveHintOneDay', 'leaveHintBirthday'])
    expect(leaveTypeHints('ANNUAL')).toEqual([])
    expect(leaveTypeHints('EXCUSE')).toEqual([])
  })

  it('maps every kinship to its own label', () => {
    expect(kinshipKey('SPOUSE')).toBe('kinshipSpouse')
    expect(kinshipKey('CHILD')).toBe('kinshipChild')
    expect(kinshipKey('PARENT')).toBe('kinshipParent')
    expect(kinshipKey('SIBLING')).toBe('kinshipSibling')
  })

  it('maps every special refusal to its own message', () => {
    // AC-14: each rule has its own sentence; a generic error would hide which rule refused.
    expect(leaveErrorKey(new ApiError(400, 'LEAVE_SPECIAL_TOO_LONG'))).toBe('leaveSpecialTooLong')
    expect(leaveErrorKey(new ApiError(400, 'LEAVE_SPECIAL_ONE_DAY'))).toBe('leaveSpecialOneDay')
    expect(leaveErrorKey(new ApiError(400, 'LEAVE_KINSHIP_REQUIRED'))).toBe('leaveKinshipRequired')
    expect(leaveErrorKey(new ApiError(400, 'LEAVE_NO_SCHOOL_AGE_CHILD'))).toBe(
      'leaveNoSchoolAgeChild',
    )
    expect(leaveErrorKey(new ApiError(400, 'LEAVE_NO_BIRTH_DATE'))).toBe('leaveNoBirthDate')
    expect(leaveErrorKey(new ApiError(400, 'LEAVE_BIRTHDAY_WINDOW'))).toBe('leaveBirthdayWindow')
    expect(leaveErrorKey(new ApiError(400, 'LEAVE_SPECIAL_QUOTA_USED'))).toBe(
      'leaveSpecialQuotaUsed',
    )
  })
})
