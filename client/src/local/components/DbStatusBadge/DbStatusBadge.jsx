import { useDbHealth } from '../../hooks/useDbHealth'
import './DbStatusBadge.css'

export function DbStatusBadge() {
  const { status, info, error } = useDbHealth()

  const label =
    status === 'ok' ? `${info?.database ?? 'DB'} connected` :
    status === 'error' ? 'DB unreachable' :
    'Checking DB…'

  const title =
    status === 'ok'
      ? `Connected to ${info?.engine} on ${info?.host}:${info?.port} as ${info?.user}`
      : status === 'error'
      ? error
      : 'Pinging /api/health/db'

  return (
    <span className={`db-status db-status--${status}`} title={title} role="status">
      <span className="db-status-dot" aria-hidden="true" />
      <span className="db-status-label">{label}</span>
    </span>
  )
}
