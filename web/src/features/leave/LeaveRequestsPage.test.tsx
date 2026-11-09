import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Me } from '@/features/auth/authApi'
import { I18nProvider } from '@/i18n/I18nProvider'
import { LeaveRequestsPage } from './LeaveRequestsPage'

const EMPLOYEE: Me = {
  id: 'u-emp',
  email: 'emp@acme.test',
  displayName: 'Employee Person',
  role: 'EMPLOYEE',
  mustChangePassword: false,
}

const MANAGER: Me = {
  id: 'u-mgr',
  email: 'mgr@acme.test',
  displayName: 'Manager Person',
  role: 'MANAGER',
  mustChangePassword: false,
}

const HR: Me = {
  id: 'u-hr',
  email: 'hr@acme.test',
  displayName: 'HR Admin',
  role: 'HR',
  mustChangePassword: false,
}

const BALANCE = {
  entitlement: 14,
  carryover: 0,
  adjustments: 2,
  approved: 3,
  pending: 2,
  remaining: 11,
  periodStart: '2026-03-15',
  periodEnd: '2027-03-15',
  hireDate: '2020-03-15',
  entitlementDefaulted: false,
  completedYears: 6,
  hasManager: true,
  managerName: 'Manager Person',
}

const PENDING_REQUEST = {
  id: 'r-1',
  employeeId: 'u-emp',
  employeeName: 'Employee Person',
  type: 'ANNUAL',
  startDate: '2026-11-30',
  endDate: '2026-12-02',
  businessDays: 3,
  status: 'PENDING',
  reason: 'aile ziyareti',
  decidedBy: null,
  decidedByName: null,
  decidedAt: null,
  decisionNote: null,
  createdAt: '2026-11-09T08:00:00Z',
  cancellable: false,
}

const DECIDED_REQUEST = {
  ...PENDING_REQUEST,
  id: 'r-2',
  employeeId: 'u-emp',
  status: 'APPROVED',
  decidedBy: 'u-mgr',
  decidedByName: 'Manager Person',
  decidedAt: '2026-11-09T09:00:00Z',
  decisionNote: 'uygun',
  cancellable: true,
}

type Route = (init?: RequestInit) => Response | Promise<Response>

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

/**
 * Routes fetch by URL; a key may prefix the method (`POST /api/leave/requests`) so the list and the
 * create do not answer each other. An unknown URL answers 404.
 */
function stubApi(routes: Record<string, Route>) {
  const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const key = Object.keys(routes).find((candidate) => {
      const [maybeMethod, ...rest] = candidate.split(' ')
      return methods.has(maybeMethod)
        ? maybeMethod === method && url.includes(rest.join(' '))
        : url.includes(candidate)
    })
    return Promise.resolve(key ? routes[key](init) : json(404, null))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function page(items: unknown[], total = items.length) {
  return json(200, {
    items,
    page: 1,
    size: 10,
    total,
    totalPages: Math.max(1, Math.ceil(total / 10)),
  })
}

function leaveRoutes(overrides: Record<string, Route> = {}) {
  return {
    '/api/auth/csrf': () => json(200, { token: 't' }),
    'GET /api/leave/balance': () => json(200, BALANCE),
    'GET /api/leave/requests': () => page([PENDING_REQUEST]),
    'GET /api/leave/queue': () => json(200, []),
    'GET /api/users': () => json(200, []),
    'GET /api/leave/preview': () => json(200, { businessDays: 3, remainingAfter: 8 }),
    ...overrides,
  }
}

function renderPage(me: Me, onForbidden = vi.fn()) {
  return {
    onForbidden,
    ...render(
      <I18nProvider>
        <LeaveRequestsPage me={me} onForbidden={onForbidden} />
      </I18nProvider>,
    ),
  }
}

beforeEach(() => {
  localStorage.clear()
  // The catalogue is pinned to Turkish: the screen's copy is part of what these tests assert.
  localStorage.setItem('leave-manager.lang', 'tr')
  document.documentElement.lang = 'tr'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('leave balance', () => {
  it('shouldShowTheBalanceOfTheCurrentPeriod', async () => {
    stubApi(leaveRoutes())

    renderPage(EMPLOYEE)

    expect(await screen.findByText('14')).toBeInTheDocument()
    expect(screen.getByText('Dönem hakkı')).toBeInTheDocument()
    expect(screen.getByText('Devreden')).toBeInTheDocument()
    expect(screen.getByText('Kalan')).toBeInTheDocument()
    // The remaining days are the server's answer, not a subtraction done in the browser.
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText(/Hak dönemi: 15\.03\.2026/)).toBeInTheDocument()
  })

  it('shouldWarnWhenTheHireDateIsUnknown', async () => {
    stubApi(
      leaveRoutes({
        'GET /api/leave/balance': () =>
          json(200, {
            ...BALANCE,
            entitlement: 0,
            carryover: 0,
            remaining: 0,
            entitlementDefaulted: true,
            hireDate: null,
            periodStart: null,
            periodEnd: null,
            completedYears: 0,
          }),
      }),
    )

    renderPage(EMPLOYEE)

    // L-05 (rule change): no hire date means no entitlement, not a guessed 14 days.
    expect(
      await screen.findByText(
        /İşe giriş tarihi girilmedi; yıllık izin hakkı hesaplanamıyor \(0 gün\)/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Dönem hakkı').parentElement).toHaveTextContent('0')
  })

  it('shouldExplainWhenNoManagerIsAssigned', async () => {
    stubApi(
      leaveRoutes({
        'GET /api/leave/balance': () =>
          json(200, { ...BALANCE, hasManager: false, managerName: null }),
      }),
    )

    renderPage(EMPLOYEE)

    expect(
      await screen.findByText(/Yöneticiniz atanmadığı için izin talebi oluşturamazsınız/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yeni talep' })).toBeDisabled()
  })

  it('shouldShowASkeletonWhileTheBalanceLoads', async () => {
    let resolveBalance!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveBalance = resolve
    })
    stubApi(leaveRoutes({ 'GET /api/leave/balance': () => pending }))

    renderPage(EMPLOYEE)

    expect(document.querySelector('[data-slot="balance-skeleton"]')).toBeInTheDocument()
    resolveBalance(json(200, BALANCE))
    expect(await screen.findByText('Dönem hakkı')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="balance-skeleton"]')).toBeNull()
  })
})

describe('request list', () => {
  it('shouldShowTheEmptyStateWhenThereIsNoRequest', async () => {
    stubApi(leaveRoutes({ 'GET /api/leave/requests': () => page([], 0) }))

    renderPage(EMPLOYEE)

    expect(await screen.findByText('Henüz izin talebiniz yok.')).toBeInTheDocument()
  })

  it('shouldShowTheFilteredEmptyState', async () => {
    stubApi(leaveRoutes({ 'GET /api/leave/requests': () => page([], 0) }))

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByText('Henüz izin talebiniz yok.')

    await user.click(screen.getByRole('button', { name: 'Onaylandı' }))

    expect(await screen.findByText('Bu filtreye uyan talep yok.')).toBeInTheDocument()
  })

  it('shouldFilterTheListByStatusOnTheServer', async () => {
    const fetchMock = stubApi(leaveRoutes())

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Bekliyor' }))

    // The filter is the server's: the request carries the status, not a client-side array filter.
    await waitFor(() =>
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('status=PENDING'),
    )
    expect(screen.getByRole('button', { name: 'Bekliyor' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shouldShowASkeletonWhileTheListLoads', async () => {
    let resolveList!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveList = resolve
    })
    stubApi(leaveRoutes({ 'GET /api/leave/requests': () => pending }))

    renderPage(EMPLOYEE)

    expect(document.querySelector('[data-slot="leave-skeleton"]')).toBeInTheDocument()
    expect(screen.queryByText('Henüz izin talebiniz yok.')).toBeNull()
    resolveList(page([PENDING_REQUEST]))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('shouldShowAnAlertWhenTheListFails', async () => {
    stubApi(
      leaveRoutes({
        'GET /api/leave/requests': () => json(500, { status: 500, code: 'INTERNAL_ERROR' }),
      }),
    )

    renderPage(EMPLOYEE)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İzin işlemi tamamlanamadı. Lütfen tekrar deneyin.',
    )
    expect(screen.queryByText('Henüz izin talebiniz yok.')).toBeNull()
  })

  it('shouldShowTheDecisionHistoryInTheRowDetail', async () => {
    stubApi(leaveRoutes({ 'GET /api/leave/requests': () => page([DECIDED_REQUEST]) }))

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Ayrıntı' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Onaylandı')).toBeInTheDocument()
    expect(within(dialog).getByText(/Karar veren: Manager Person/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Karar notu: uygun/)).toBeInTheDocument()
  })

  it('shouldShowWhoCancelledWithoutLosingTheDecision', async () => {
    // L-17: the withdrawal has its own actor and moment; the decision stays on screen too.
    const cancelled = {
      ...DECIDED_REQUEST,
      id: 'r-3',
      status: 'CANCELLED',
      cancellable: false,
      cancelledAt: '2026-11-10T10:00:00Z',
      cancelledBy: 'u-emp',
      cancelledByName: 'Employee Person',
    }
    stubApi(leaveRoutes({ 'GET /api/leave/requests': () => page([cancelled]) }))

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Ayrıntı' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Karar veren: Manager Person/)).toBeInTheDocument()
    expect(within(dialog).getByText(/İptal eden: Employee Person/)).toBeInTheDocument()
  })

  it('shouldLetTheOwnerCancelAnApprovedRequest', async () => {
    const cancel = vi.fn((_init?: RequestInit) =>
      json(200, { ...DECIDED_REQUEST, status: 'CANCELLED', cancellable: false }),
    )
    stubApi(
      leaveRoutes({
        'GET /api/leave/requests': () => page([DECIDED_REQUEST]),
        'POST /api/leave/requests/r-2/cancel': cancel,
      }),
    )

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Talebi iptal et' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Talebi iptal et' }))

    await waitFor(() => expect(cancel).toHaveBeenCalled())
    expect(await screen.findByText('Talep iptal edildi; bakiye geri yüklendi.')).toBeInTheDocument()
  })
})

describe('request dialog', () => {
  it('shouldCreateARequestAndShowTheServerSummary', async () => {
    const create = vi.fn((_init?: RequestInit) => json(201, { ...PENDING_REQUEST, id: 'r-new' }))
    stubApi(
      leaveRoutes({
        'POST /api/leave/requests': create,
        'GET /api/leave/requests': () => page([PENDING_REQUEST]),
      }),
    )

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-11-30' },
    })
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-12-02' } })
    await user.type(within(dialog).getByLabelText('Gerekçe'), 'aile ziyareti')

    // The summary comes from the server: it owns the business calendar (BR-4).
    expect(
      await within(dialog).findByText(/3 iş günü · Talepten sonra kalan: 8 gün/),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(JSON.parse(String(create.mock.calls[0]?.[0]?.body))).toEqual({
      type: 'ANNUAL',
      startDate: '2026-11-30',
      endDate: '2026-12-02',
      reason: 'aile ziyareti',
    })
    expect(await screen.findByText('İzin talebi oluşturuldu.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shouldMapAServerRefusalToItsMessageAndKeepTheDialogOpen', async () => {
    stubApi(
      leaveRoutes({
        'POST /api/leave/requests': () => json(409, { status: 409, code: 'LEAVE_OVERLAP' }),
      }),
    )

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-11-30' },
    })
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-12-02' } })
    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    expect(
      await within(dialog).findByText(
        'Bu tarihlerde bekleyen veya onaylı başka bir talebiniz var.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shouldRequireAReasonForAnExcuseLeave', async () => {
    // L-02: phase A's excuse leave always carries its reason, and the form says so before sending.
    const create = vi.fn((_init?: RequestInit) => json(201, { ...PENDING_REQUEST, id: 'r-new' }))
    stubApi(leaveRoutes({ 'POST /api/leave/requests': create }))

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'İzin türü' }))
    await user.click(await screen.findByRole('option', { name: 'Mazeret izni' }))
    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-11-30' },
    })
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-11-30' } })

    const submit = within(dialog).getByRole('button', { name: 'Talebi gönder' })
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Gerekçe'), 'rapor sonradan iletildi')
    expect(submit).toBeEnabled()
  })

  it('shouldMapTheRangeCapAndTheExcuseBoundToTheirOwnMessages', async () => {
    stubApi(
      leaveRoutes({
        'POST /api/leave/requests': () => json(400, { status: 400, code: 'LEAVE_RANGE_TOO_LONG' }),
      }),
    )

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-11-30' },
    })
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2027-12-31' } })
    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    expect(
      await within(dialog).findByText('En fazla 366 günlük bir tarih aralığı seçilebilir.'),
    ).toBeInTheDocument()
  })

  it('shouldReturnFocusToTheTriggerWhenTheDialogCloses', async () => {
    stubApi(leaveRoutes())
    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    const trigger = screen.getByRole('button', { name: 'Yeni talep' })
    await user.click(trigger)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })
})

describe('manager queue', () => {
  const TEAM_REQUEST = {
    ...PENDING_REQUEST,
    id: 'r-team',
    employeeId: 'u-report',
    employeeName: 'Report Person',
  }

  it('shouldShowThePendingRequestsOfTheDirectReports', async () => {
    stubApi(leaveRoutes({ 'GET /api/leave/queue': () => json(200, [TEAM_REQUEST]) }))

    renderPage(MANAGER)

    expect(await screen.findByText('Onay kuyruğu')).toBeInTheDocument()
    expect(screen.getByText('Report Person')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Onayla' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reddet' })).toBeInTheDocument()
  })

  it('shouldShowTheEmptyQueue', async () => {
    stubApi(leaveRoutes({ 'GET /api/leave/queue': () => json(200, []) }))

    renderPage(MANAGER)

    expect(await screen.findByText('Bekleyen talep yok.')).toBeInTheDocument()
  })

  it('shouldApproveFromTheQueueAfterAConfirmation', async () => {
    const approve = vi.fn((_init?: RequestInit) =>
      json(200, { ...TEAM_REQUEST, status: 'APPROVED' }),
    )
    stubApi(
      leaveRoutes({
        'GET /api/leave/queue': () => json(200, [TEAM_REQUEST]),
        'POST /api/leave/requests/r-team/approve': approve,
      }),
    )

    const user = userEvent.setup()
    renderPage(MANAGER)
    await screen.findByText('Report Person')

    await user.click(screen.getByRole('button', { name: 'Onayla' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Bu talep onaylanacak ve bakiye düşecek.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Onayla' }))

    await waitFor(() => expect(approve).toHaveBeenCalled())
    expect(await screen.findByText('Karar kaydedildi.')).toBeInTheDocument()
  })

  it('shouldRequireAReasonToReject', async () => {
    const reject = vi.fn((_init?: RequestInit) =>
      json(200, { ...TEAM_REQUEST, status: 'REJECTED' }),
    )
    stubApi(
      leaveRoutes({
        'GET /api/leave/queue': () => json(200, [TEAM_REQUEST]),
        'POST /api/leave/requests/r-team/reject': reject,
      }),
    )

    const user = userEvent.setup()
    renderPage(MANAGER)
    await screen.findByText('Report Person')

    await user.click(screen.getByRole('button', { name: 'Reddet' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reddet' }))

    // No request leaves the browser: the dialog explains what is missing and stays open.
    expect(reject).not.toHaveBeenCalled()
    expect(within(dialog).getByText('Ret için bir gerekçe yazın.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Ret gerekçesi'), 'dönem yoğun')
    await user.click(within(dialog).getByRole('button', { name: 'Reddet' }))
    await waitFor(() => expect(reject).toHaveBeenCalled())
    expect(JSON.parse(String(reject.mock.calls[0]?.[0]?.body))).toEqual({ note: 'dönem yoğun' })
  })
})

describe('hr view', () => {
  it('shouldReadEveryRequestAndAdjustABalance', async () => {
    const adjust = vi.fn((_init?: RequestInit) =>
      json(200, { ...BALANCE, adjustments: 4, remaining: 13 }),
    )
    stubApi(
      leaveRoutes({
        'GET /api/leave/requests': () =>
          page([{ ...PENDING_REQUEST, employeeId: 'u-other', employeeName: 'Other Person' }]),
        'GET /api/users': () =>
          json(200, [
            {
              id: 'u-other',
              email: 'other@acme.test',
              displayName: 'Other Person',
              role: 'EMPLOYEE',
              active: true,
              mustChangePassword: false,
              managerId: null,
              hireDate: null,
            },
          ]),
        'POST /api/leave/adjustments': adjust,
      }),
    )

    renderPage(HR)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Other Person')).toBeInTheDocument()
    expect(screen.getByText('Bakiye düzeltmesi')).toBeInTheDocument()
    // HR never decides (BR-7): no approval control exists on this screen.
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reddet' })).toBeNull()
    expect(await screen.findByRole('combobox', { name: 'Çalışan' })).toBeInTheDocument()
    expect(screen.getByLabelText('Gün (eksi düşürür)')).toBeInTheDocument()
  })

  it('shouldNotCallTheManagerQueueForAnEmployee', async () => {
    const queue = vi.fn(() => json(200, []))
    stubApi(leaveRoutes({ 'GET /api/leave/queue': queue }))

    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    expect(queue).not.toHaveBeenCalled()
    expect(screen.queryByText('Onay kuyruğu')).toBeNull()
  })

  it('shouldFillTheAdjustmentFormAndShowTheNewRemaining', async () => {
    // L-13: the HR form is filled and sent, and the answer's new remaining is what the screen shows.
    const adjust = vi.fn((_init?: RequestInit) =>
      json(200, { ...BALANCE, adjustments: 5, remaining: 14 }),
    )
    stubApi(
      leaveRoutes({
        'GET /api/users': () =>
          json(200, [
            {
              id: 'u-other',
              email: 'other@acme.test',
              displayName: 'Other Person',
              role: 'EMPLOYEE',
              active: true,
              mustChangePassword: false,
              managerId: null,
              hireDate: '2020-03-15',
            },
          ]),
        'POST /api/leave/adjustments': adjust,
      }),
    )

    const user = userEvent.setup()
    renderPage(HR)
    await screen.findByText('Bakiye düzeltmesi')

    await user.click(screen.getByRole('combobox', { name: 'Çalışan' }))
    await user.click(await screen.findByRole('option', { name: 'Other Person' }))
    await user.type(screen.getByLabelText('Gün (eksi düşürür)'), '3')
    await user.type(screen.getByLabelText('Gerekçe'), 'geçmiş dönem düzeltmesi')
    await user.click(screen.getByRole('button', { name: 'Düzeltmeyi kaydet' }))

    await waitFor(() => expect(adjust).toHaveBeenCalled())
    expect(JSON.parse(String(adjust.mock.calls[0]?.[0]?.body))).toEqual({
      employeeId: 'u-other',
      days: 3,
      reason: 'geçmiş dönem düzeltmesi',
    })
    expect(await screen.findByText('Yeni kalan: 14 gün')).toBeInTheDocument()
  })

  it('shouldMapAnAdjustmentRefusalToItsOwnMessage', async () => {
    // L-18: "this correction would go below zero" is its own sentence, not the annual-request one.
    stubApi(
      leaveRoutes({
        'GET /api/users': () =>
          json(200, [
            {
              id: 'u-other',
              email: 'other@acme.test',
              displayName: 'Other Person',
              role: 'EMPLOYEE',
              active: true,
              mustChangePassword: false,
              managerId: null,
              hireDate: '2020-03-15',
            },
          ]),
        'POST /api/leave/adjustments': () =>
          json(409, { status: 409, code: 'LEAVE_ADJUSTMENT_NOT_ALLOWED' }),
      }),
    )

    const user = userEvent.setup()
    renderPage(HR)
    await screen.findByText('Bakiye düzeltmesi')

    await user.click(screen.getByRole('combobox', { name: 'Çalışan' }))
    await user.click(await screen.findByRole('option', { name: 'Other Person' }))
    await user.type(screen.getByLabelText('Gün (eksi düşürür)'), '-40')
    await user.type(screen.getByLabelText('Gerekçe'), 'fazla düzeltme')
    await user.click(screen.getByRole('button', { name: 'Düzeltmeyi kaydet' }))

    expect(
      await screen.findByText('Bu düzeltme bakiyeyi eksiye düşüreceği için yapılamaz.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Kalan bakiyeniz bu talep için yeterli değil.')).toBeNull()
  })
})

describe('accessibility', () => {
  it('shouldHaveNoViolationsOnTheLeaveScreen', async () => {
    stubApi(
      leaveRoutes({
        'GET /api/leave/requests': () => page([PENDING_REQUEST, DECIDED_REQUEST]),
      }),
    )

    const { container } = renderPage(EMPLOYEE)
    await screen.findByRole('table')

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shouldReachTheRequestDialogFromTheKeyboard', async () => {
    stubApi(leaveRoutes())
    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    const trigger = screen.getByRole('button', { name: 'Yeni talep' })
    trigger.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog')
    // Focus is trapped inside the dialog: the first Tab lands on one of its controls.
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })
})
