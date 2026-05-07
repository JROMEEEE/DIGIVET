import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import './DashboardOverview.css'

const MODULES = [
  { to: '/dashboard/encode',  icon: 'EN', name: 'Encode',        desc: 'Record a new vaccination' },
  { to: '/dashboard/records', icon: 'RC', name: 'Records',       desc: 'View, edit, delete entries' },
  { to: '/dashboard/vets',    icon: 'VT', name: 'Veterinarians', desc: 'Manage vets & approval IDs' },
]

const STAT_CARDS = (s) => [
  { label: 'TOTAL RECORDS',   value: s?.total_vaccinations, desc: 'in local database',  accent: '#7a1f2b' },
  { label: "TODAY'S ENTRIES", value: s?.today_entries,      desc: 'new vaccinations',   accent: '#16a34a' },
  { label: 'REGISTERED PETS', value: s?.total_pets,         desc: 'in the registry',    accent: '#2563eb' },
  { label: 'PET OWNERS',      value: s?.total_owners,       desc: 'registered owners',  accent: '#d97706' },
]

export default function DashboardOverview() {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.stats.get()
      .then((d) => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const top     = stats?.top_barangays   ?? []
  const session = stats?.active_session  ?? null
  const recent  = stats?.recent_entries  ?? []
  const cards   = STAT_CARDS(stats)

  return (
    <main className="overview">

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="overview-stats">
        {cards.map((c) => (
          <div key={c.label} className="overview-stat-card" style={{ '--accent': c.accent }}>
            <span className="overview-stat-label">{c.label}</span>
            <span className="overview-stat-value">
              {loading ? '—' : (c.value ?? 0).toLocaleString()}
            </span>
            <span className="overview-stat-desc">{c.desc}</span>
          </div>
        ))}
      </div>

      {/* ── Module shortcuts ───────────────────────────────── */}
      <section className="overview-section">
        <h3 className="overview-section-title">Quick actions</h3>
        <div className="overview-modules">
          {MODULES.map((m) => (
            <Link key={m.to} to={m.to} className="overview-module-card">
              <span className="overview-module-icon">{m.icon}</span>
              <span className="overview-module-text">
                <span className="overview-module-name">{m.name}</span>
                <span className="overview-module-desc">{m.desc}</span>
              </span>
              <span className="overview-module-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Bottom two-column ──────────────────────────────── */}
      <div className="overview-bottom">

        {/* Today's session ─────────────────────────────────── */}
        <section className="overview-panel">
          <div className="overview-panel-head">
            <span className="overview-panel-icon" aria-hidden="true">▣</span>
            <h3 className="overview-panel-title">
              {session
                ? `Today's session — ${session.barangay_name}`
                : "Today's session"}
            </h3>
          </div>

          {loading ? (
            <p className="overview-hint">Loading…</p>
          ) : !session ? (
            <div className="overview-no-session">
              <p>No active barangay drive session for today.</p>
              <Link to="/dashboard/encode" className="btn btn-outline overview-session-cta">
                Start a session →
              </Link>
            </div>
          ) : recent.length === 0 ? (
            <p className="overview-hint">No vaccinations recorded in this session yet.</p>
          ) : (
            <>
              <table className="overview-session-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Pet</th>
                    <th>Type</th>
                    <th>Vaccine</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={r.vaccine_id}>
                      <td className="overview-session-num">{i + 1}</td>
                      <td className="overview-session-pet">{r.pet_name}</td>
                      <td className="overview-session-type">{r.pet_type}</td>
                      <td className="overview-session-vaccine">{r.vaccine_details}</td>
                      <td>
                        <span className="overview-session-code">{r.approval_code ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="overview-panel-foot">
                <Link to="/dashboard/records" className="overview-viewall">
                  View all records →
                </Link>
              </div>
            </>
          )}
        </section>

        {/* Right column ─────────────────────────────────────── */}
        <div className="overview-right">

          {/* Top barangays */}
          <section className="overview-panel">
            <div className="overview-panel-head">
              <span className="overview-panel-icon" aria-hidden="true">◈</span>
              <h3 className="overview-panel-title">Top barangays</h3>
            </div>
            {loading ? (
              <p className="overview-hint">Loading…</p>
            ) : top.length === 0 ? (
              <p className="overview-hint">No data yet.</p>
            ) : (
              <ol className="overview-brgy-list">
                {top.map((b, i) => (
                  <li key={b.barangay_name} className="overview-brgy-item">
                    <div
                      className="overview-brgy-bar"
                      style={{ '--pct': `${Math.round((b.count / top[0].count) * 100)}%` }}
                      aria-hidden="true"
                    />
                    <span className="overview-brgy-rank">#{i + 1}</span>
                    <span className="overview-brgy-name">{b.barangay_name}</span>
                    <span className="overview-brgy-count">{b.count.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Autosync placeholder */}
          <section className="overview-panel overview-panel--autosync">
            <div className="overview-panel-head">
              <span className="overview-panel-icon overview-panel-icon--sync" aria-hidden="true">⟳</span>
              <h3 className="overview-panel-title">Sync status</h3>
              <span className="overview-sync-badge">Soon</span>
            </div>
            <p className="overview-sync-status">
              <span className="overview-sync-dot" />
              Autosync not configured
            </p>
            <p className="overview-hint">
              Online database sync and export controls will appear here once autosync is set up.
            </p>
          </section>

        </div>
      </div>
    </main>
  )
}
