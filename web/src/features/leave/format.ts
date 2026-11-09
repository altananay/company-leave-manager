import { ApiError } from '@/features/auth/authApi'
import type { MessageKey } from '@/i18n/messages'
import type { LeaveStatus, LeaveType } from './leaveApi'

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
    case 'LEAVE_REASON_REQUIRED':
      return 'leaveReasonRequired'
    case 'LEAVE_EXCUSE_TOO_LONG':
      return 'leaveExcuseTooLong'
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
    case 'LEAVE_NOT_OWNER':
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
  return type === 'ANNUAL' ? 'leaveTypeAnnual' : 'leaveTypeExcuse'
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
