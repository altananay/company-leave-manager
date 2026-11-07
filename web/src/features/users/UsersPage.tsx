import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import { ApiError, authApi, type CreatedUser, type User } from '../auth/authApi'

type ErrorKey =
  | 'emailExists'
  | 'roleNotAssignable'
  | 'validationFailed'
  | 'protectedAccount'
  | 'selfAction'
  | 'genericError'

function errorKeyFor(failure: unknown): ErrorKey {
  const code = failure instanceof ApiError ? failure.code : 'ERROR'
  switch (code) {
    case 'EMAIL_EXISTS':
      return 'emailExists'
    case 'ROLE_NOT_ASSIGNABLE':
    case 'INVALID_ROLE':
      return 'roleNotAssignable'
    case 'VALIDATION_FAILED':
      return 'validationFailed'
    case 'PROTECTED_ACCOUNT':
      return 'protectedAccount'
    case 'SELF_ACTION_NOT_ALLOWED':
      return 'selfAction'
    default:
      return 'genericError'
  }
}

export function UsersPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  const [users, setUsers] = useState<User[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [created, setCreated] = useState<CreatedUser | null>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('EMPLOYEE')
  const [busy, setBusy] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setUsers(await authApi.users())
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 403) {
        setForbidden(true)
      } else {
        setError(errorKeyFor(failure))
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    authApi
      .users()
      .then((list) => {
        if (!cancelled) {
          setUsers(list)
        }
      })
      .catch((failure) => {
        if (cancelled) {
          return
        }
        if (failure instanceof ApiError && failure.status === 403) {
          setForbidden(true)
        } else {
          setError(errorKeyFor(failure))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      setCreated(await authApi.createUser(email, displayName, role))
      setEmail('')
      setDisplayName('')
      await load()
    } catch (failure) {
      setError(errorKeyFor(failure))
    } finally {
      setBusy(false)
    }
  }

  async function deactivate(user: User) {
    setError(null)
    setConfirmingId(null)
    try {
      await authApi.deactivate(user.id)
      await load()
    } catch (failure) {
      setError(errorKeyFor(failure))
    }
  }

  async function resetPassword(user: User) {
    setError(null)
    try {
      setCreated(await authApi.resetPassword(user.id))
      await load()
    } catch (failure) {
      setError(errorKeyFor(failure))
    }
  }

  if (forbidden) {
    return (
      <section className="card">
        <h2>{t('forbiddenTitle')}</h2>
        <button type="button" onClick={onBack}>
          {t('back')}
        </button>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="row">
        <h2>{t('usersTitle')}</h2>
        <button type="button" className="secondary" onClick={onBack}>
          {t('back')}
        </button>
      </div>

      {created && (
        <p className="notice" role="status">
          {t('temporaryPasswordOnce')} <code>{created.temporaryPassword}</code>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}

      <form className="stack" onSubmit={create}>
        <h3>{t('newUser')}</h3>
        <label>
          {t('email')}
          <input
            type="email"
            value={email}
            aria-invalid={error === 'emailExists' || error === 'validationFailed'}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          {t('displayName')}
          <input
            value={displayName}
            aria-invalid={error === 'validationFailed'}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        <label>
          {t('role')}
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="EMPLOYEE">{t('roleEmployee')}</option>
            <option value="MANAGER">{t('roleManager')}</option>
          </select>
        </label>
        <button type="submit" disabled={busy}>
          {t('create')}
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>{t('displayName')}</th>
            <th>{t('email')}</th>
            <th>{t('role')}</th>
            <th>{t('active')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.displayName}</td>
              <td>{user.email}</td>
              <td>{t(roleKey(user.role))}</td>
              <td>{user.active ? t('active') : t('inactive')}</td>
              <td>
                {isProtected(user) ? (
                  // The server refuses these rows (PROTECTED_ACCOUNT); the UI must not offer them.
                  <span className="muted">{t('protectedAccount')}</span>
                ) : (
                  <>
                    <button type="button" className="secondary" onClick={() => resetPassword(user)}>
                      {t('resetPassword')}
                    </button>
                    {confirmingId === user.id ? (
                      <>
                        <span className="confirm-text">{t('confirmDeactivate')}</span>
                        <button type="button" className="danger" onClick={() => deactivate(user)}>
                          {t('confirm')}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setConfirmingId(null)}
                        >
                          {t('cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setConfirmingId(user.id)}
                      >
                        {t('deactivate')}
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Seeded accounts are managed by the environment, not by this screen (spec 0002, AC-6). */
function isProtected(user: User): boolean {
  return user.role === 'HR' || user.role === 'CEO'
}

function roleKey(role: string): MessageKey {
  switch (role) {
    case 'HR':
      return 'roleHr'
    case 'CEO':
      return 'roleCeo'
    case 'MANAGER':
      return 'roleManager'
    default:
      return 'roleEmployee'
  }
}
