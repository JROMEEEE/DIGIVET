import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const POLL_MS = 15_000

export function useDbHealth() {
  const [state, setState] = useState({ status: 'checking', info: null, error: null })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()

    async function check() {
      try {
        const info = await api.health.db(controller.signal)
        if (mounted.current) setState({ status: 'ok', info, error: null })
      } catch (err) {
        if (err.name === 'AbortError') return
        if (mounted.current) setState({ status: 'error', info: null, error: err.message })
      }
    }

    check()
    const id = setInterval(check, POLL_MS)
    return () => {
      mounted.current = false
      clearInterval(id)
      controller.abort()
    }
  }, [])

  return state
}
