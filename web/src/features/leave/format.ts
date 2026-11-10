import { ApiError } from '@/features/auth/authApi'
import type { Lang, MessageKey } from '@/i18n/messages'
import type { HalfDay, Kinship, LeaveStatus, LeaveType } from './leaveApi'

/** The types that are exactly one working day, so the form has no end date to ask for (D19). */
const ONE_DAY_TYPES: readonly LeaveType[] = ['SCHOOL_REPORT', 'BIRTHDAY', 'FIRST_SCHOOL_DAY']

export function isOneDayType(type: LeaveType): boolean {
  return ONE_DAY_TYPES.includes(type)
}

/**
 * The server's stable code becomes the catalogue's message; the SPA never writes prose itself.
 *
 * <p>The adjustment refusals have their own messages (review round 1, L-18): "the balance is not
 * enough for this request" (the annual-request refusal) is not the same sentence as "this
 * correction would push the balance below zero", and telling them apart is the difference between
 * a wrong form and a wrong number.
 */
export function leaveErrorKey(failure: unknown): MessageKey {
  const code = failure instanceof ApiError ? failure.code : 'ERROR'
  switch (code) {
    case 'LEAVE_PAST_DATE':
      return 'leavePastDate'
    case 'LEAVE_INVALID_RANGE':
      return 'leaveInvalidRange'
    case 'LEAVE_RANGE_TOO_LONG':
      return 'leaveRangeTooLong'
    case 'LEAVE_NO_WORKING_DAY':
      return 'leaveNoWorkingDay'
    case 'LEAVE_HALF_DAY_INVALID':
      return 'leaveHalfDayInvalid'
    case 'LEAVE_REASON_REQUIRED':
      return 'leaveReasonRequired'
    case 'LEAVE_EXCUSE_TOO_LONG':
      return 'leaveExcuseTooLong'
    case 'LEAVE_SPECIAL_TOO_LONG':
      return 'leaveSpecialTooLong'
    case 'LEAVE_SPECIAL_ONE_DAY':
      return 'leaveSpecialOneDay'
    case 'LEAVE_KINSHIP_REQUIRED':
      return 'leaveKinshipRequired'
    case 'LEAVE_NO_SCHOOL_AGE_CHILD':
      return 'leaveNoSchoolAgeChild'
    case 'LEAVE_NO_BIRTH_DATE':
      return 'leaveNoBirthDate'
    case 'LEAVE_BIRTHDAY_WINDOW':
      return 'leaveBirthdayWindow'
    case 'LEAVE_SPECIAL_QUOTA_USED':
      return 'leaveSpecialQuotaUsed'
    case 'LEAVE_RETROACTIVE_REASON_REQUIRED':
      return 'leaveRetroactiveReasonRequired'
    case 'LEAVE_NO_HIRE_DATE':
      return 'leaveNoHireDate'
    case 'LEAVE_OVERLAP':
      return 'leaveOverlap'
    case 'LEAVE_BALANCE_EXCEEDED':
      return 'leaveBalanceExceeded'
    case 'LEAVE_NO_MANAGER':
      return 'leaveNoManagerError'
    case 'LEAVE_NOT_MANAGER':
      return 'leaveNotManager'
    case 'LEAVE_ALREADY_STARTED':
      return 'leaveAlreadyStarted'
    case 'LEAVE_NOT_PENDING':
      return 'leaveNotPending'
    case 'LEAVE_NOT_APPROVED':
      return 'leaveNotApproved'
    case 'LEAVE_ADJUSTMENT_NOT_ALLOWED':
      return 'leaveAdjustmentNotAllowed'
    case 'LEAVE_INVALID_ADJUSTMENT':
      return 'leaveAdjustmentInvalid'
    case 'VALIDATION_FAILED':
      return 'validationFailed'
    default:
      return 'leaveError'
  }
}

export function leaveTypeKey(type: LeaveType): MessageKey {
  switch (type) {
    case 'ANNUAL':
      return 'leaveTypeAnnual'
    case 'EXCUSE':
      return 'leaveTypeExcuse'
    case 'MARRIAGE':
      return 'leaveTypeMarriage'
    case 'BEREAVEMENT':
      return 'leaveTypeBereavement'
    case 'SPOUSE_BIRTH':
      return 'leaveTypeSpouseBirth'
    case 'SCHOOL_REPORT':
      return 'leaveTypeSchoolReport'
    case 'BIRTHDAY':
      return 'leaveTypeBirthday'
    case 'FIRST_SCHOOL_DAY':
      return 'leaveTypeFirstSchoolDay'
  }
}

/**
 * The form says what the selected type allows before the request is sent. The sentences live in
 * the catalogue; this only decides which ones apply.
 */
export function leaveTypeHints(type: LeaveType): MessageKey[] {
  switch (type) {
    case 'MARRIAGE':
    case 'BEREAVEMENT':
    case 'SPOUSE_BIRTH':
      return ['leaveHintFiveDays']
    case 'SCHOOL_REPORT':
    case 'FIRST_SCHOOL_DAY':
      return ['leaveHintOneDay', 'leaveHintSchoolAgeChild']
    case 'BIRTHDAY':
      return ['leaveHintOneDay', 'leaveHintBirthday']
    default:
      return []
  }
}

export function kinshipKey(kinship: Kinship): MessageKey {
  switch (kinship) {
    case 'SPOUSE':
      return 'kinshipSpouse'
    case 'CHILD':
      return 'kinshipChild'
    case 'PARENT':
      return 'kinshipParent'
    case 'SIBLING':
      return 'kinshipSibling'
  }
}

export function halfDayKey(halfDay: HalfDay): MessageKey {
  switch (halfDay) {
    case 'NONE':
      return 'halfDayNone'
    case 'AM':
      return 'halfDayAm'
    case 'PM':
      return 'halfDayPm'
  }
}

/**
 * Days are fractional from B1 on: a half day is 0.5 (D16). The screen shows it in the catalogue's
 * locale ("0,5" in Turkish, "0.5" in English) and never as a raw floating-point number; the API
 * still owns the value and the arithmetic.
 */
export function formatDays(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(value)
}

export function leaveStatusKey(status: LeaveStatus): MessageKey {
  switch (status) {
    case 'PENDING':
      return 'statusPending'
    case 'APPROVED':
      return 'statusApproved'
    case 'REJECTED':
      return 'statusRejected'
    case 'CANCELLED':
      return 'statusCancelled'
  }
}

/** Colour supports the word, never replaces it: the badge always carries the status text. */
export function leaveStatusVariant(status: LeaveStatus): 'default' | 'success' | 'muted' {
  switch (status) {
    case 'APPROVED':
      return 'success'
    case 'PENDING':
      return 'default'
    default:
      return 'muted'
  }
}
