import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../shared/AuthContext'
import { api } from '../../api'
import './SyncPage.css'

function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleString()
}

function timeAgo(d) {
  if (!d) return null
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const TABLE_LABELS = {
  barangay_table:      'Barangays',
  vet_table:           'Veterinarians',
  owner_table:         'Pet Owners',
  pet_table:           'Pets',
  drive_session_table: 'Drive Sessions',
  approval_id_table:   'Approval IDs',
  vaccine_table:       'Vaccinations',
}

export default function SyncPage() {
  const { user }  = useAuth()
  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase]     = useState('idle') // idle | auth | countdown | syncing | done

  const [syncResults, setSyncResults] = useState(null)
  const [syncError, setSyncError]     = useState(null)

  useEffect(() => {
    api.sync.status()
      .then((d) => { setStatus(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function handleSyncDone(results) {
    setSyncResults(results)
    setPhase('done')
    // refresh status
    api.sync.status().then(setStatus).catch(() => {})
  }

  const last = status?.last_sync
  const totalLocal = status?.tables?.reduce((s, t) => s + t.pending_count, 0) ?? 0

  return (
    <main className="sync-page">
      <div className="sync-header">
        <div>
          <h2 className="sync-title">Sync to Supabase</h2>
          <p className="sync-sub">Push all local records to the online database.</p>
        </div>
        {!loading && phase === 'idle' && (
          <button type="button" className="btn btn-primary sync-start-btn"
            onClick={() => setPhase('auth')}>
            Push to Supabase
          </button>
        )}
      </div>

      {/* Connection status */}
      <div className={`sync-status-card${status?.connected ? ' sync-status-card--ok' : ' sync-status-card--off'}`}>
        <span className={`sync-dot ${status?.connected ? 'sync-dot--ok' : 'sync-dot--off'}`} />
        <div className="sync-status-info">
          <span className="sync-status-label">
            {status?.connected ? 'Supabase connected' : 'Supabase not configured'}
          </span>
          <span className="sync-status-url">{status?.supabase_url ?? '—'}</span>
        </div>
        <div className="sync-last">
          <span className="sync-last-label">Last sync</span>
          <span className="sync-last-val">
            {last ? `${timeAgo(last.last_sync_at)} · ${last.records_synced} records` : 'Never'}
          </span>
        </div>
      </div>

      {/* Table grid */}
      <section className="sync-section">
        <h3 className="sync-section-title">
          {status?.is_first_sync ? 'All records (first sync)' : 'Pending changes since last sync'}
        </h3>
        <div className="sync-table-grid">
          {loading ? (
            <p className="sync-hint">Loading…</p>
          ) : (
            status?.tables?.map((t) => (
              <div key={t.name} className={`sync-table-card${t.pending_count === 0 ? ' sync-table-card--clean' : ''}`}>
                <span className="sync-table-name">{TABLE_LABELS[t.name] ?? t.name}</span>
                <span className="sync-table-count">{t.pending_count.toLocaleString()}</span>
                <span className="sync-table-label">
                  {t.pending_count === 0 ? 'up to date' : 'pending'}
                </span>
              </div>
            ))
          )}
        </div>
        <p className="sync-total">
          {totalLocal === 0
            ? 'Everything is up to date.'
            : <>
                <strong>{totalLocal.toLocaleString()}</strong> record{totalLocal !== 1 ? 's' : ''} pending sync
                {!status?.is_first_sync && <span className="sync-total-since"> since last push</span>}
              </>
          }
        </p>
      </section>

      {/* Results after sync */}
      {phase === 'done' && syncResults && (
        <section className="sync-section">
          <h3 className="sync-section-title">Sync results</h3>
          <div className="sync-results">
            {syncResults.results.map((r) => (
              <div key={r.table} className={`sync-result-row sync-result-row--${r.status}`}>
                <span className="srr-icon">
                  {r.status === 'ok' ? '✓' : r.status === 'empty' ? '—' : '✗'}
                </span>
                <span className="srr-table">{TABLE_LABELS[r.table] ?? r.table}</span>
                <span className="srr-count">{r.status === 'ok' ? `${r.synced} synced` : r.status}</span>
                {r.error && <span className="srr-error">{r.error}</span>}
              </div>
            ))}
          </div>
          <p className="sync-total">
            ✓ <strong>{syncResults.total_synced.toLocaleString()}</strong> records pushed to Supabase
          </p>
          <button type="button" className="btn btn-outline" onClick={() => { setPhase('idle'); setSyncResults(null) }}>
            Done
          </button>
        </section>
      )}

      {/* Auth modal */}
      {phase === 'auth' && (
        <AuthConfirmModal
          user={user}
          onConfirmed={() => setPhase('countdown')}
          onCancel={() => setPhase('idle')}
        />
      )}

      {/* 3-2-1 countdown modal */}
      {phase === 'countdown' && (
        <CountdownModal
          totalRecords={totalLocal}
          onGo={async () => {
            setPhase('syncing')
            try {
              const result = await api.sync.push()
              handleSyncDone(result)
            } catch (err) {
              setSyncError(err.detail ?? err.message)
              setPhase('done')
            }
          }}
          onCancel={() => setPhase('idle')}
        />
      )}

      {/* Syncing overlay */}
      {phase === 'syncing' && (
        <div className="sync-overlay">
          <div className="sync-overlay-card">
            <div className="sync-spinner" aria-hidden="true" />
            <p>Pushing records to Supabase…</p>
            <p className="sync-hint">Do not close this window.</p>
          </div>
        </div>
      )}
    </main>
  )
}

/* ── Auth confirmation modal ───────────────────────────────────── */
function AuthConfirmModal({ user, onConfirmed, onCancel }) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function confirm(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await api.auth.login({ email: user.email, password })
      onConfirmed()
    } catch (err) {
      setError(err.message ?? 'Invalid password.')
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal sync-auth-modal" role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Confirm your identity</h3>
        <p className="modal-body">
          Enter your password to authorise pushing <strong>all local records</strong> to Supabase.
        </p>
        {error && <div className="acct-banner acct-banner--error">{error}</div>}
        <form onSubmit={confirm} className="sync-auth-form">
          <label className="acct-label">
            Password
            <input required type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="encode-input" autoFocus placeholder="Enter your password" />
          </label>
          <div className="modal-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── 3-2-1 countdown modal ─────────────────────────────────────── */
function CountdownModal({ totalRecords, onGo, onCancel }) {
  const [count, setCount] = useState(3)
  const fired = useRef(false)

  useEffect(() => {
    if (count <= 0) {
      if (!fired.current) { fired.current = true; onGo() }
      return
    }
    const id = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [count, onGo])

  return (
    <div className="modal-backdrop">
      <div className="modal sync-countdown-modal" role="dialog" aria-modal="true">
        <h3 className="modal-title">Syncing in…</h3>
        <p className="modal-body">
          About to push <strong>{totalRecords.toLocaleString()}</strong> records to Supabase.
        </p>

        <div className="countdown-ring">
          <svg viewBox="0 0 100 100" className="countdown-svg">
            <circle cx="50" cy="50" r="44" className="countdown-track" />
            <circle cx="50" cy="50" r="44" className="countdown-fill"
              style={{ strokeDashoffset: `${276 - (276 * count) / 3}` }} />
          </svg>
          <span className="countdown-num">{count}</span>
        </div>

        <p className="countdown-hint">Sync starts automatically. Click cancel to abort.</p>

        <div className="modal-actions">
          <button type="button" className="btn btn-danger" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
