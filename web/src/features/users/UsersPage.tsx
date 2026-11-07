import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
import { ApiError, authApi, type CreatedUser, type User } from '../auth/authApi'

export function UsersPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  const [users, setUsers] = useState<User[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [failed, setFailed] = useState(false)
  const [created, setCreated] = useState<CreatedUser | null>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('EMPLOYEE')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setUsers(await authApi.users())
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 403) {
        setForbidden(true)
      } else {
        setFailed(true)
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
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      setCreated(await authApi.createUser(email, displayName, role))
      setEmail('')
      setDisplayName('')
      await load()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function deactivate(user: User) {
    await authApi.deactivate(user.id).catch(() => setFailed(true))
    await load()
  }

  async function resetPassword(user: User) {
    try {
      setCreated(await authApi.resetPassword(user.id))
      await load()
    } catch {
      setFailed(true)
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
      {failed && (
        <p className="error" role="alert">
          {t('loginFailed')}
        </p>
      )}

      <form className="stack" onSubmit={create}>
        <h3>{t('newUser')}</h3>
        <label>
          {t('email')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          {t('displayName')}
          <input
            value={displayName}
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
                <button type="button" className="secondary" onClick={() => resetPassword(user)}>
                  {t('resetPassword')}
                </button>
                <button type="button" className="danger" onClick={() => deactivate(user)}>
                  {t('deactivate')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function roleKey(role: string) {
  switch (role) {
    case 'HR':
      return 'roleHr' as const
    case 'CEO':
      return 'roleCeo' as const
    case 'MANAGER':
      return 'roleManager' as const
    default:
      return 'roleEmployee' as const
  }
}
