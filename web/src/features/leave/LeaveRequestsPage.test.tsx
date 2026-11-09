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
  halfDay: 'NONE',
  status: 'PENDING',
  reason: 'aile ziyareti',
  kinship: null,
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
    'GET /api/leave/days': () => json(200, []),
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

type UserEventApi = ReturnType<typeof userEvent.setup>

/** Opens the type selector and picks a type by its Turkish catalogue label. */
async function chooseLeaveType(user: UserEventApi, dialog: HTMLElement, label: string) {
  await user.click(within(dialog).getByRole('combobox', { name: 'İzin türü' }))
  await user.click(await screen.findByRole('option', { name: label }))
}

/** Opens the kinship selector of a bereavement request and picks a relative. */
async function chooseKinship(user: UserEventApi, dialog: HTMLElement, label: string) {
  await user.click(within(dialog).getByRole('combobox', { name: 'Yakınlık' }))
  await user.click(await screen.findByRole('option', { name: label }))
}

function setRange(dialog: HTMLElement, startDate: string, endDate: string) {
  fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
    target: { value: startDate },
  })
  fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: endDate } })
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

  it('shouldShowTheHalfDayInTheRequestDetail', async () => {
    // AC-1/AC-12: the detail carries the half-day label next to the fractional duration.
    const halfDayRequest = {
      ...DECIDED_REQUEST,
      id: 'r-half-detail',
      startDate: '2026-11-30',
      endDate: '2026-11-30',
      businessDays: 0.5,
      halfDay: 'PM',
    }
    stubApi(leaveRoutes({ 'GET /api/leave/requests': () => page([halfDayRequest]) }))

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Ayrıntı' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Yarım gün')).toBeInTheDocument()
    expect(within(dialog).getByText('Öğleden sonra')).toBeInTheDocument()
    expect(within(dialog).getByText('0,5')).toBeInTheDocument()
  })

  it('shouldShowTheKinshipOfABereavementRequestInTheDetail', async () => {
    // D18: the kinship is part of the request's own record and the detail names it.
    const bereavement = {
      ...DECIDED_REQUEST,
      id: 'r-ber-detail',
      type: 'BEREAVEMENT',
      kinship: 'CHILD',
    }
    stubApi(leaveRoutes({ 'GET /api/leave/requests': () => page([bereavement]) }))

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Ayrıntı' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Yakınlık')).toBeInTheDocument()
    expect(within(dialog).getByText('Çocuk')).toBeInTheDocument()
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
    const days = vi.fn(() => json(200, []))
    stubApi(
      leaveRoutes({
        'GET /api/leave/requests': () => page([DECIDED_REQUEST]),
        'GET /api/leave/days': days,
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
    await waitFor(() => expect(days).toHaveBeenCalledTimes(2))
  })
})

describe('request dialog', () => {
  it('shouldCreateARequestAndShowTheServerSummary', async () => {
    const create = vi.fn((_init?: RequestInit) => json(201, { ...PENDING_REQUEST, id: 'r-new' }))
    const days = vi.fn(() => json(200, []))
    stubApi(
      leaveRoutes({
        'POST /api/leave/requests': create,
        'GET /api/leave/requests': () => page([PENDING_REQUEST]),
        'GET /api/leave/days': days,
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
      halfDay: 'NONE',
      reason: 'aile ziyareti',
    })
    expect(await screen.findByText('İzin talebi oluşturuldu.')).toBeInTheDocument()
    // The "my days" card refreshes once the request exists (mount + one bump).
    await waitFor(() => expect(days).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shouldOfferTheEightLeaveTypes', async () => {
    // AC-14: BR-10's six special types join annual and excuse leave in one flat list.
    stubApi(leaveRoutes())

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'İzin türü' }))

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Yıllık izin',
      'Mazeret izni',
      'Evlilik izni',
      'Vefat izni',
      'Eş doğumu izni',
      'Karne izni',
      'Doğum günü izni',
      'Okulun ilk günü izni',
    ])
  })

  it('shouldShowTheHintOfTheSelectedType', async () => {
    // D19: the form names the bound and the condition before the server has to refuse anything.
    stubApi(leaveRoutes())

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('En çok 5 iş günü.')).toBeNull()

    await chooseLeaveType(user, dialog, 'Evlilik izni')
    expect(within(dialog).getByText('En çok 5 iş günü.')).toBeInTheDocument()

    await chooseLeaveType(user, dialog, 'Karne izni')
    expect(within(dialog).getByText('1 iş günü.')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Okul çağında çocuğunuz olmalı; yılda 1 gün.'),
    ).toBeInTheDocument()

    await chooseLeaveType(user, dialog, 'Doğum günü izni')
    expect(
      within(dialog).getByText('Doğum gününüzden itibaren 180 gün içinde 1 gün.'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('Okul çağında çocuğunuz olmalı; yılda 1 gün.')).toBeNull()
  })

  it('shouldRequireTheKinshipOnlyForABereavementLeave', async () => {
    // D17/D19: the kinship select exists for a bereavement request and blocks the submit until set.
    stubApi(leaveRoutes())

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('combobox', { name: 'Yakınlık' })).toBeNull()

    await chooseLeaveType(user, dialog, 'Vefat izni')
    expect(within(dialog).getByRole('combobox', { name: 'Yakınlık' })).toBeInTheDocument()
    setRange(dialog, '2026-11-30', '2026-12-02')
    const submit = within(dialog).getByRole('button', { name: 'Talebi gönder' })
    expect(submit).toBeDisabled()

    await chooseKinship(user, dialog, 'Kardeş')
    expect(submit).toBeEnabled()

    await chooseLeaveType(user, dialog, 'Yıllık izin')
    expect(within(dialog).queryByRole('combobox', { name: 'Yakınlık' })).toBeNull()
  })

  it('shouldSendTheKinshipOfABereavementRequest', async () => {
    // The kinship travels in the create body for BEREAVEMENT (the frozen contract).
    const create = vi.fn((_init?: RequestInit) =>
      json(201, {
        ...PENDING_REQUEST,
        id: 'r-ber',
        type: 'BEREAVEMENT',
        kinship: 'SPOUSE',
      }),
    )
    stubApi(leaveRoutes({ 'POST /api/leave/requests': create }))

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    await chooseLeaveType(user, dialog, 'Vefat izni')
    setRange(dialog, '2026-11-30', '2026-11-30')
    // D15: a special type is whole-day even on a single day, so the half-day control is absent.
    expect(within(dialog).queryByRole('combobox', { name: 'Yarım gün' })).toBeNull()
    await chooseKinship(user, dialog, 'Eş')
    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(JSON.parse(String(create.mock.calls[0]?.[0]?.body))).toEqual({
      type: 'BEREAVEMENT',
      startDate: '2026-11-30',
      endDate: '2026-11-30',
      halfDay: 'NONE',
      reason: null,
      kinship: 'SPOUSE',
    })
    expect(await screen.findByText('İzin talebi oluşturuldu.')).toBeInTheDocument()
  })

  it('shouldHideTheEndDateAndSendTheSameDayForAOneDayType', async () => {
    // D19: the one-day types have no end date; the start is sent as both ends.
    const create = vi.fn((_init?: RequestInit) =>
      json(201, {
        ...PENDING_REQUEST,
        id: 'r-birthday',
        type: 'BIRTHDAY',
        startDate: '2026-11-30',
        endDate: '2026-11-30',
        businessDays: 1,
      }),
    )
    const fetchMock = stubApi(leaveRoutes({ 'POST /api/leave/requests': create }))

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    await chooseLeaveType(user, dialog, 'Doğum günü izni')
    expect(within(dialog).getByLabelText('Başlangıç')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Bitiş')).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-11-30' },
    })

    const previewUrls = () =>
      fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter((url) => url.includes('/api/leave/preview'))
    await waitFor(() => expect(previewUrls().at(-1)).toContain('endDate=2026-11-30'))

    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(JSON.parse(String(create.mock.calls[0]?.[0]?.body))).toEqual({
      type: 'BIRTHDAY',
      startDate: '2026-11-30',
      endDate: '2026-11-30',
      halfDay: 'NONE',
      reason: null,
    })
  })

  it('shouldMapTheKinshipRefusalToItsOwnMessage', async () => {
    stubApi(
      leaveRoutes({
        'POST /api/leave/requests': () =>
          json(400, { status: 400, code: 'LEAVE_KINSHIP_REQUIRED' }),
      }),
    )

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    await chooseLeaveType(user, dialog, 'Vefat izni')
    setRange(dialog, '2026-11-30', '2026-12-02')
    await chooseKinship(user, dialog, 'Çocuk')
    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    expect(
      await within(dialog).findByText('Vefat izni için yakınlık derecesi zorunludur.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText('İzin işlemi tamamlanamadı. Lütfen tekrar deneyin.'),
    ).toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shouldMapTheBirthdayWindowRefusalToItsOwnMessage', async () => {
    stubApi(
      leaveRoutes({
        'POST /api/leave/requests': () => json(400, { status: 400, code: 'LEAVE_BIRTHDAY_WINDOW' }),
      }),
    )

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    await chooseLeaveType(user, dialog, 'Doğum günü izni')
    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-11-30' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    expect(
      await within(dialog).findByText(
        'Doğum günü izni en son doğum gününüzden itibaren 180 gün içinde kullanılmalıdır.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shouldOfferHalfDayOnlyForASingleDay', async () => {
    // D15: the control exists for a one-day annual/excuse request, disappears on a range, and the
    // reset value is what the preview asks the server about.
    const fetchMock = stubApi(leaveRoutes())

    const user = userEvent.setup()
    renderPage(EMPLOYEE)
    await screen.findByRole('table')

    await user.click(screen.getByRole('button', { name: 'Yeni talep' }))
    const dialog = await screen.findByRole('dialog')
    // Before both dates are chosen there is no single day to halve.
    expect(within(dialog).queryByRole('combobox', { name: 'Yarım gün' })).toBeNull()

    fireEvent.change(within(dialog).getByLabelText('Başlangıç'), {
      target: { value: '2026-11-30' },
    })
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-11-30' } })
    expect(within(dialog).getByRole('combobox', { name: 'Yarım gün' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('combobox', { name: 'Yarım gün' }))
    await user.click(await screen.findByRole('option', { name: 'Öğleden önce' }))

    const previewUrls = () =>
      fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter((url) => url.includes('/api/leave/preview'))
    await waitFor(() => expect(previewUrls().at(-1)).toContain('halfDay=AM'))

    // A range has no half day: the control disappears and the choice resets to NONE.
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-12-02' } })
    expect(within(dialog).queryByRole('combobox', { name: 'Yarım gün' })).toBeNull()
    await waitFor(() => expect(previewUrls().at(-1)).toContain('halfDay=NONE'))

    // An excuse leave on a single day keeps the choice too.
    await user.click(within(dialog).getByRole('combobox', { name: 'İzin türü' }))
    await user.click(await screen.findByRole('option', { name: 'Mazeret izni' }))
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-11-30' } })
    expect(within(dialog).getByRole('combobox', { name: 'Yarım gün' })).toBeInTheDocument()
  })

  it('shouldSendTheHalfDayAndShowTheFractionalSummary', async () => {
    // AC-1/AC-12: the server's 0.5 is shown as "0,5" and travels back in the POST body.
    const create = vi.fn((_init?: RequestInit) =>
      json(201, {
        ...PENDING_REQUEST,
        id: 'r-half',
        startDate: '2026-11-30',
        endDate: '2026-11-30',
        businessDays: 0.5,
        halfDay: 'AM',
      }),
    )
    const fetchMock = stubApi(
      leaveRoutes({
        'GET /api/leave/preview': () => json(200, { businessDays: 0.5, remainingAfter: 7.5 }),
        'POST /api/leave/requests': create,
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
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-11-30' } })

    await user.click(within(dialog).getByRole('combobox', { name: 'Yarım gün' }))
    await user.click(await screen.findByRole('option', { name: 'Öğleden önce' }))

    expect(
      await within(dialog).findByText(/0,5 iş günü · Talepten sonra kalan: 7,5 gün/),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            String(call[0]).includes('/api/leave/preview') &&
            String(call[0]).includes('halfDay=AM'),
        ),
      ).toBe(true),
    )

    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(JSON.parse(String(create.mock.calls[0]?.[0]?.body))).toEqual({
      type: 'ANNUAL',
      startDate: '2026-11-30',
      endDate: '2026-11-30',
      halfDay: 'AM',
      reason: null,
    })
    expect(await screen.findByText('İzin talebi oluşturuldu.')).toBeInTheDocument()
  })

  it('shouldMapAHalfDayRefusalToItsOwnMessage', async () => {
    stubApi(
      leaveRoutes({
        'POST /api/leave/requests': () =>
          json(400, { status: 400, code: 'LEAVE_HALF_DAY_INVALID' }),
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
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-11-30' } })
    await user.click(within(dialog).getByRole('combobox', { name: 'Yarım gün' }))
    await user.click(await screen.findByRole('option', { name: 'Öğleden sonra' }))
    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    expect(
      await within(dialog).findByText(
        'Yarım gün yalnızca tek günlük yıllık veya mazeret izninde seçilebilir.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText('İzin işlemi tamamlanamadı. Lütfen tekrar deneyin.'),
    ).toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
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

  it('shouldMapTheRangeCapToItsOwnMessage', async () => {
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

  it('shouldMapTheExcuseBoundToItsOwnMessage', async () => {
    // M-10: the excuse bound has its own sentence; asserting only the range cap left the name of the
    // old test claiming a case it never exercised.
    stubApi(
      leaveRoutes({
        'POST /api/leave/requests': () => json(400, { status: 400, code: 'LEAVE_EXCUSE_TOO_LONG' }),
      }),
    )

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
    fireEvent.change(within(dialog).getByLabelText('Bitiş'), { target: { value: '2026-12-11' } })
    await user.type(within(dialog).getByLabelText('Gerekçe'), 'uzun mazeret')
    await user.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }))

    expect(
      await within(dialog).findByText('Mazeret izni en fazla 5 iş günü olabilir.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText('En fazla 366 günlük bir tarih aralığı seçilebilir.'),
    ).toBeNull()
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

describe('my leave days', () => {
  it('shouldListOwnApprovedDaysWithTheirHalfDay', async () => {
    stubApi(
      leaveRoutes({
        'GET /api/leave/days': () =>
          json(200, [{ date: '2026-11-30', type: 'ANNUAL', halfDay: 'AM', requestId: 'r-1' }]),
      }),
    )

    renderPage(EMPLOYEE)

    expect(await screen.findByRole('heading', { name: 'İzinli günlerim' })).toBeInTheDocument()
    expect(document.querySelector('[data-my-leave-days]')).not.toBeNull()
    const row = await waitFor(() => {
      const found = document.querySelector('[data-slot="my-leave-day"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    // One row carries date, type and half-day together; none of it is colour-only.
    expect(within(row).getByText('30.11.2026')).toBeInTheDocument()
    expect(row.querySelector('time')).toHaveAttribute('datetime', '2026-11-30')
    expect(within(row).getByText('Yıllık izin')).toBeInTheDocument()
    expect(within(row).getByText('Öğleden önce')).toBeInTheDocument()
  })

  it('shouldShowTheEmptyMyLeaveDaysState', async () => {
    stubApi(leaveRoutes({ 'GET /api/leave/days': () => json(200, []) }))

    renderPage(EMPLOYEE)

    expect(await screen.findByText('Önümüzdeki 90 günde izniniz yok.')).toBeInTheDocument()
  })

  it('shouldShowASkeletonWhileMyLeaveDaysLoad', async () => {
    let resolveDays!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      resolveDays = resolve
    })
    stubApi(leaveRoutes({ 'GET /api/leave/days': () => pending }))

    renderPage(EMPLOYEE)

    expect(document.querySelector('[data-slot="my-leave-days-skeleton"]')).toBeInTheDocument()
    resolveDays(
      json(200, [{ date: '2026-11-30', type: 'EXCUSE', halfDay: 'PM', requestId: 'r-9' }]),
    )
    expect(await screen.findByText('Öğleden sonra')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="my-leave-days-skeleton"]')).toBeNull()
  })

  it('shouldShowTheMyLeaveDaysErrorState', async () => {
    stubApi(
      leaveRoutes({
        'GET /api/leave/days': () => json(500, { status: 500, code: 'INTERNAL_ERROR' }),
      }),
    )

    renderPage(EMPLOYEE)

    expect(
      await screen.findByText('İşlem tamamlanamadı. Lütfen tekrar deneyin.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Önümüzdeki 90 günde izniniz yok.')).toBeNull()
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

  it('shouldShowTheKinshipInTheQueue', async () => {
    // D18: the direct manager sees the kinship of a bereavement request before deciding.
    const bereavement = {
      ...TEAM_REQUEST,
      id: 'r-team-ber',
      type: 'BEREAVEMENT',
      kinship: 'SIBLING',
    }
    stubApi(leaveRoutes({ 'GET /api/leave/queue': () => json(200, [bereavement]) }))

    renderPage(MANAGER)

    expect(await screen.findByText('Report Person')).toBeInTheDocument()
    expect(screen.getByText('Yakınlık: Kardeş')).toBeInTheDocument()
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

  it('shouldAdjustTheBalanceByHalfADay', async () => {
    // D16: HR corrections move in half-day steps; the new remaining is formatted as a decimal.
    const adjust = vi.fn((_init?: RequestInit) =>
      json(200, { ...BALANCE, adjustments: 0.5, remaining: 11.5 }),
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
    const days = screen.getByLabelText('Gün (eksi düşürür)')
    expect(days).toHaveAttribute('step', '0.5')
    await user.type(days, '0.5')
    await user.type(screen.getByLabelText('Gerekçe'), 'yarım gün düzeltmesi')
    await user.click(screen.getByRole('button', { name: 'Düzeltmeyi kaydet' }))

    await waitFor(() => expect(adjust).toHaveBeenCalled())
    expect(JSON.parse(String(adjust.mock.calls[0]?.[0]?.body))).toEqual({
      employeeId: 'u-other',
      days: 0.5,
      reason: 'yarım gün düzeltmesi',
    })
    expect(await screen.findByText('Yeni kalan: 11,5 gün')).toBeInTheDocument()
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
