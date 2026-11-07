import { useCallback, useEffect, useState } from 'react'

export type HealthState = 'loading' | 'up' | 'down'

type HealthBody = { status?: string }

/**
 * Reads GET /api/health and maps it to the three UI states of the spec.
 * A response is "up" only when it is ok AND the body says UP.
 */
export function useHealth() {
  const [state, setState] = useState<HealthState>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    fetch('/api/health', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as HealthBody | null
        if (cancelled) {
          return
        }
        setState(response.ok && body?.status === 'UP' ? 'up' : 'down')
      })
      .catch(() => {
        if (!cancelled) {
          setState('down')
        }
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  // The loading state is set by the event that starts a new attempt, not inside the effect.
  const retry = useCallback(() => {
    setState('loading')
    setAttempt((current) => current + 1)
  }, [])

  return { state, retry }
}
