import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../shared/AuthContext'
import { api } from '../../api'
import './DashboardOverview.css'

function timeAgo(d) {
  if (!d) return null
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate() {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

const MODULES = [
  { to: '/dashboard/encode',    emoji: '✏️',  name: 'Encode',         desc: 'Record vaccinations'    },
  { to: '/dashboard/records',   emoji: '📋',  name: 'Records',        desc: 'View & manage entries'  },
  { to: '/dashboard/analytics', emoji: '📊',  name: 'Analytics',      desc: 'Coverage & insights'    },
  { to: '/dashboard/vets',      emoji: '🩺',  name: 'Veterinarians',  desc: 'Vets & approval IDs'    },
  { to: '/dashboard/sync',      emoji: '🔄',  name: 'Sync',           desc: 'Push to Supabase'       },
]

const STAT_DEFS = [
  { key: 'total_vaccinations', label: 'Total Records',    desc: 'vaccination records', color: 'var(--maroon)',  bg: 'var(--maroon-soft)', icon: '💉' },
  { key: 'today_entries',      label: "Today's Entries",  desc: 'new today',           color: '#16a34a',        bg: '#f0fdf4',            icon: '📅' },
  { key: 'total_pets',         label: 'Registered Pets',  desc: 'in the registry',     color: '#2563eb',        bg: '#eff6ff',            icon: '🐾' },
  { key: 'total_owners',       label: 'Pet Owners',       desc: 'registered',          color: '#d97706',        bg: '#fffbeb',            icon: '👥' },
]

export default function DashboardOverview() {
  const { user } = useAuth()
  const [stats, setStats]           = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    // Load independently so a failed auth on sync.status() doesn't wipe the stats
    api.stats.get()
      .then((s) => { setStats(s); setLoading(false) })
      .catch(() => setLoading(false))

    api.sync.status()
      .then(setSyncStatus)
      .catch(() => {}) // non-critical — sync panel just stays empty
  }, [])

  const top    = stats?.top_barangays  ?? []
  const session = stats?.active_session ?? null
  const recent  = stats?.recent_entries ?? []

  return (
    <main className="overview">

      {/* ── Page header ─────────────────────────────────────── */}
      <header className="overview-header">
        <div className="overview-header-left">
          <h1 className="overview-header-title">Overview</h1>
          <p className="overview-header-date">{formatDate()}</p>
        </div>
        <div className="overview-header-right">
          <div className={`overview-header-sync ${syncStatus?.connected ? 'is-ok' : 'is-off'}`}>
            <span className="overview-header-sync-dot" />
            <span>{syncStatus?.connected ? 'Supabase connected' : 'Supabase offline'}</span>
          </div>
          <Link to="/dashboard/sync" className="btn btn-outline overview-header-sync-btn">
            Sync Dashboard →
          </Link>
        </div>
      </header>

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="overview-stats">
        {STAT_DEFS.map((s) => (
          <div
            key={s.key}
            className="overview-stat-card"
            style={{ '--sc': s.color, '--sb': s.bg }}
          >
            <div className="overview-stat-top">
              <span className="overview-stat-label">{s.label}</span>
              <span className="overview-stat-icon">{s.icon}</span>
            </div>
            <span className="overview-stat-value">
              {loading ? '—' : (stats?.[s.key] ?? 0).toLocaleString()}
            </span>
            <span className="overview-stat-desc">{s.desc}</span>
          </div>
        ))}
      </div>

      {/* ── Quick actions ──────────────────────────────────── */}
      <section className="overview-modules-section">
        <p className="overview-label">Quick actions</p>
        <div className="overview-modules">
          {MODULES.map((m) => (
            <Link key={m.to} to={m.to} className="overview-module-card">
              <span className="overview-module-emoji">{m.emoji}</span>
              <span className="overview-module-body">
                <span className="overview-module-name">{m.name}</span>
                <span className="overview-module-desc">{m.desc}</span>
              </span>
              <span className="overview-module-arrow">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Main content ───────────────────────────────────── */}
      <div className="overview-content">

        {/* Left: Today's session ──────────────────────────── */}
        <section className="overview-panel">
          <div className="overview-panel-head">
            <div className="overview-panel-head-left">
              <span className="overview-panel-head-icon">📋</span>
              <div>
                <h3 className="overview-panel-title">Today's Session</h3>
                {session && (
                  <p className="overview-panel-subtitle">{session.barangay_name}</p>
                )}
              </div>
            </div>
            {session && (
              <span className="overview-session-badge">Active</span>
            )}
          </div>

          {loading ? (
            <div className="overview-empty"><span className="overview-spinner" /></div>
          ) : !session ? (
            <div className="overview-empty">
              <span className="overview-empty-icon">🗓️</span>
              <p className="overview-empty-title">No active session today</p>
              <p className="overview-empty-sub">Start a barangay vaccination drive to see entries here.</p>
              <Link to="/dashboard/encode" className="btn btn-primary overview-empty-btn">
                Start a session
              </Link>
            </div>
          ) : recent.length === 0 ? (
            <div className="overview-empty">
              <span className="overview-empty-icon">💉</span>
              <p className="overview-empty-title">No vaccinations recorded yet</p>
              <p className="overview-empty-sub">Encoded entries will appear here.</p>
            </div>
          ) : (
            <>
              <div className="overview-table-wrap">
                <table className="overview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Pet</th>
                      <th>Type</th>
                      <th>Vaccine</th>
                      <th>Approval Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r, i) => (
                      <tr key={r.vaccine_id}>
                        <td className="overview-table-num">{i + 1}</td>
                        <td className="overview-table-name">{r.pet_name}</td>
                        <td className="overview-table-muted">{r.pet_type}</td>
                        <td className="overview-table-muted">{r.vaccine_details}</td>
                        <td>
                          <span className="overview-code-badge">{r.approval_code ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overview-panel-foot">
                <Link to="/dashboard/records" className="overview-viewall">
                  View all records →
                </Link>
              </div>
            </>
          )}
        </section>

        {/* Right column ───────────────────────────────────── */}
        <div className="overview-right">

          {/* Top barangays */}
          <section className="overview-panel">
            <div className="overview-panel-head">
              <div className="overview-panel-head-left">
                <span className="overview-panel-head-icon">🏘️</span>
                <h3 className="overview-panel-title">Top Barangays</h3>
              </div>
            </div>
            {loading ? (
              <div className="overview-empty"><span className="overview-spinner" /></div>
            ) : top.length === 0 ? (
              <div className="overview-empty">
                <p className="overview-empty-sub">No barangay data yet.</p>
              </div>
            ) : (
              <ol className="overview-brgy-list">
                {top.map((b, i) => (
                  <li key={b.barangay_name} className="overview-brgy-item">
                    <div
                      className="overview-brgy-bar"
                      style={{ '--pct': `${Math.round((b.count / top[0].count) * 100)}%` }}
                    />
                    <span className="overview-brgy-rank">{i + 1}</span>
                    <span className="overview-brgy-name">{b.barangay_name}</span>
                    <span className="overview-brgy-count">{b.count.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Sync status */}
          <section className="overview-panel overview-panel--sync">
            <div className="overview-panel-head">
              <div className="overview-panel-head-left">
                <span className="overview-panel-head-icon">🔄</span>
                <h3 className="overview-panel-title">Supabase Sync</h3>
              </div>
              <span className={`overview-sync-pill ${syncStatus?.connected ? 'is-ok' : 'is-off'}`}>
                {syncStatus?.connected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="overview-sync-body">
              <div className="overview-sync-row">
                <span className="overview-sync-key">Last sync</span>
                <span className="overview-sync-val">
                  {syncStatus?.last_sync
                    ? `${timeAgo(syncStatus.last_sync.last_sync_at)} · ${syncStatus.last_sync.records_synced} records`
                    : 'Never'}
                </span>
              </div>
              <div className="overview-sync-row">
                <span className="overview-sync-key">Status</span>
                <span className="overview-sync-val">
                  {syncStatus?.last_sync?.status ?? '—'}
                </span>
              </div>
            </div>
            <div className="overview-panel-foot">
              <Link to="/dashboard/sync" className="overview-viewall">
                Open Sync Dashboard →
              </Link>
            </div>
          </section>

        </div>
      </div>
    </main>
  )
}
