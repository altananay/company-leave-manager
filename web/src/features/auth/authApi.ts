export type Role = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'CEO'

export type Me = {
  id: string
  email: string
  displayName: string
  role: Role
  mustChangePassword: boolean
}

export type User = Me & { active: boolean }

export type CreatedUser = { user: User; temporaryPassword: string }

export class Unauthorized extends Error {}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: string[]

  constructor(status: number, code: string, errors: string[] = []) {
    super(code)
    this.status = status
    this.code = code
    this.errors = errors
  }
}

let csrfToken: string | null = null
let onUnauthorized: (() => void) | null = null

/**
 * One place decides what a lost session means: the app sends the user back to the login screen
 * (spec 0002, "Hata davranışı"). Pages never handle 401 themselves.
 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

export function resetCsrfToken() {
  csrfToken = null
}

async function csrf(): Promise<string> {
  if (csrfToken) {
    return csrfToken
  }
  const response = await fetch('/api/auth/csrf', { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new ApiError(response.status, 'CSRF_UNAVAILABLE')
  }
  const body = (await response.json()) as { token: string }
  csrfToken = body.token
  return csrfToken
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['X-CSRF-TOKEN'] = await csrf()
  }
  const response = await fetch(path, { ...init, method, headers })
  if (response.status === 401) {
    csrfToken = null
    onUnauthorized?.()
    throw new Unauthorized('unauthorized')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      code?: string
      errors?: string[]
    } | null
    throw new ApiError(response.status, body?.code ?? 'ERROR', body?.errors ?? [])
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const authApi = {
  me: () => request<Me>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  // The session (and its CSRF token) ends with the logout: the next login must fetch a fresh one.
  logout: async () => {
    await request<void>('/api/auth/logout', { method: 'POST' })
    csrfToken = null
  },
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    request<void>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    }),
  users: () => request<User[]>('/api/users'),
  createUser: (email: string, displayName: string, role: string) =>
    request<CreatedUser>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ email, displayName, role }),
    }),
  deactivate: (id: string) => request<void>(`/api/users/${id}/deactivate`, { method: 'POST' }),
  resetPassword: (id: string) =>
    request<CreatedUser>(`/api/users/${id}/reset-password`, { method: 'POST' }),
}
