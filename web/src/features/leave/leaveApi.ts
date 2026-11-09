import { apiRequest } from '@/features/auth/authApi'

export type LeaveType = 'ANNUAL' | 'EXCUSE'

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

/** A single day is either whole or half; only a one-day ANNUAL/EXCUSE request may carry AM/PM (D15). */
export type HalfDay = 'NONE' | 'AM' | 'PM'

/** One approved day of the caller, as `GET /api/leave/days` answers it (D20). */
export type LeaveDay = {
  date: string
  type: LeaveType
  halfDay: HalfDay
  requestId: string
}

export type LeaveRequest = {
  id: string
  employeeId: string
  employeeName: string | null
  type: LeaveType
  startDate: string
  endDate: string
  businessDays: number
  halfDay: HalfDay
  status: LeaveStatus
  reason: string | null
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
  /** The server's answer to "may the owner withdraw it now" (BR-8); never re-derived here. */
  cancellable: boolean
  /** The withdrawal's own record; the decision's timestamp stays in `decidedAt` (L-17). */
  cancelledAt: string | null
  cancelledBy: string | null
  cancelledByName: string | null
  /** True for the HR-recorded request that started in the past (BR-11's exception, L-06). */
  retroactive: boolean
}

export type LeavePage = {
  items: LeaveRequest[]
  page: number
  size: number
  total: number
  totalPages: number
}

export type Balance = {
  entitlement: number
  carryover: number
  adjustments: number
  approved: number
  pending: number
  remaining: number
  periodStart: string | null
  periodEnd: string | null
  hireDate: string | null
  /** True while the hire date is unknown: the screen shows the documented warning. */
  entitlementDefaulted: boolean
  completedYears: number
  hasManager: boolean
  managerName: string | null
}

export type Preview = { businessDays: number; remainingAfter: number }

export const leaveApi = {
  balance: (employeeId?: string) =>
    apiRequest<Balance>(
      employeeId ? `/api/leave/balance?employeeId=${employeeId}` : '/api/leave/balance',
    ),
  requests: (page: number, size: number, status?: LeaveStatus) =>
    apiRequest<LeavePage>(
      `/api/leave/requests?page=${page}&size=${size}${status ? `&status=${status}` : ''}`,
    ),
  queue: () => apiRequest<LeaveRequest[]>('/api/leave/queue'),
  preview: (startDate: string, endDate: string, type: LeaveType, halfDay: HalfDay) =>
    apiRequest<Preview>(
      `/api/leave/preview?startDate=${startDate}&endDate=${endDate}&type=${type}&halfDay=${halfDay}`,
    ),
  create: (type: LeaveType, startDate: string, endDate: string, halfDay: HalfDay, reason: string) =>
    apiRequest<LeaveRequest>('/api/leave/requests', {
      method: 'POST',
      body: JSON.stringify({ type, startDate, endDate, halfDay, reason: reason.trim() || null }),
    }),
  days: () => apiRequest<LeaveDay[]>('/api/leave/days'),
  approve: (id: string, note: string) =>
    apiRequest<LeaveRequest>(`/api/leave/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note: note.trim() || null }),
    }),
  reject: (id: string, note: string) =>
    apiRequest<LeaveRequest>(`/api/leave/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  cancel: (id: string) =>
    apiRequest<LeaveRequest>(`/api/leave/requests/${id}/cancel`, { method: 'POST' }),
  adjust: (employeeId: string, days: number, reason: string) =>
    apiRequest<Balance>('/api/leave/adjustments', {
      method: 'POST',
      body: JSON.stringify({ employeeId, days, reason: reason.trim() }),
    }),
}
