import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import './AnalyticsPage.css'

export default function AnalyticsPage() {
  const [showCoverageModal, setShowCoverageModal] = useState(false)

  return (
    <main className="analytics">
      <div className="analytics-header">
        <h2>Analytics</h2>
        <p>Vaccination coverage insights powered by R.</p>
      </div>

      <REnginePanel />

      <div className="analytics-grid">
        {/* Live chart — top 5 by barangay */}
        <BarangayCoverageChart
          onViewAll={() => setShowCoverageModal(true)}
        />

        <div className="analytics-placeholder">
          <span className="analytics-placeholder-icon" aria-hidden="true">📈</span>
          <span className="analytics-placeholder-label">Monthly vaccination trends</span>
        </div>
        <div className="analytics-placeholder">
          <span className="analytics-placeholder-icon" aria-hidden="true">🗺️</span>
          <span className="analytics-placeholder-label">Area coverage map</span>
        </div>
        <div className="analytics-placeholder">
          <span className="analytics-placeholder-icon" aria-hidden="true">🐾</span>
          <span className="analytics-placeholder-label">Pet type breakdown</span>
        </div>
        <div className="analytics-placeholder">
          <span className="analytics-placeholder-icon" aria-hidden="true">👨‍⚕️</span>
          <span className="analytics-placeholder-label">Top vets by records</span>
        </div>
      </div>

      {showCoverageModal && (
        <BarangayCoverageModal onClose={() => setShowCoverageModal(false)} />
      )}
    </main>
  )
}

// ── Top-5 bar chart ──────────────────────────────────────────────
function BarangayCoverageChart({ onViewAll }) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    api.analytics.barangayCoverage({ limit: 5 })
      .then((res) => {
        if (res.status === 'ok') setData(res.data ?? [])
        else setOffline(true)
        setLoading(false)
      })
      .catch(() => { setOffline(true); setLoading(false) })
  }, [])

  const max = data.length ? Math.max(...data.map((d) => d.vaccination_count)) : 1

  return (
    <div className="analytics-placeholder analytics-placeholder--wide analytics-chart-card">
      <div className="chart-header">
        <div>
          <span className="chart-title">Vaccination by Barangay</span>
          <span className="chart-sub">Top 5</span>
        </div>
        {!loading && !offline && data.length > 0 && (
          <button type="button" className="chart-view-btn" onClick={onViewAll}>
            View all →
          </button>
        )}
      </div>

      {loading ? (
        <p className="chart-state">Loading from R…</p>
      ) : offline ? (
        <p className="chart-state chart-state--offline">
          R engine offline — start the API to load charts.
        </p>
      ) : data.length === 0 ? (
        <p className="chart-state">No data yet.</p>
      ) : (
        <div className="bar-chart" onClick={onViewAll} role="button" tabIndex={0}
             title="Click to explore all barangays">
          {data.map((d) => (
            <div key={d.barangay_name} className="bar-row">
              <span className="bar-label">{d.barangay_name}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(d.vaccination_count / max) * 100}%` }}
                />
              </div>
              <span className="bar-value">{d.vaccination_count.toLocaleString()}</span>
            </div>
          ))}
          <p className="chart-click-hint">Click chart to explore all barangays</p>
        </div>
      )}
    </div>
  )
}

// ── Searchable coverage modal ────────────────────────────────────
function BarangayCoverageModal({ onClose }) {
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const tokenRef              = useRef(0)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const token = ++tokenRef.current
    api.analytics.barangayCoverage({ limit: 200 })
      .then((res) => {
        if (token !== tokenRef.current) return
        if (res.status === 'ok') setAllData(res.data ?? [])
        else setError(res.message ?? 'R engine error')
        setLoading(false)
      })
      .catch((err) => {
        if (token !== tokenRef.current) return
        setError(err.detail ?? err.message)
        setLoading(false)
      })
  }, [])

  const q          = search.trim().toLowerCase()
  const isSearching = q.length > 0
  const filtered   = isSearching
    ? allData.filter((d) => d.barangay_name.toLowerCase().includes(q))
    : allData.slice(0, 10)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--lg"
        role="dialog"
        aria-modal="true"
        aria-label="Vaccination coverage by barangay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="modal-title">Vaccination by Barangay</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-search-bar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search barangay name…"
            className="encode-input"
            autoFocus
          />
          <span className="modal-result-count">
            {loading ? '…'
              : isSearching ? `${filtered.length} found`
              : `Top ${filtered.length} of ${allData.length}`}
          </span>
        </div>

        <div className="modal-scroll">
          {loading ? (
            <p className="modal-state">Loading…</p>
          ) : error ? (
            <p className="modal-state">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="modal-state">No barangay matches "{search}".</p>
          ) : (
            <>
              <div className="coverage-col-head">
                <span>#</span>
                <span>Barangay</span>
                <span>Vaccinations</span>
                <span>Registered Pets</span>
                <span>Coverage</span>
              </div>
              <ul className="coverage-list">
                {filtered.map((d, i) => {
                  const rank = isSearching ? allData.indexOf(d) + 1 : i + 1
                  return (
                    <li key={d.barangay_name} className="coverage-row">
                      <span className="coverage-rank">#{rank}</span>
                      <span className="coverage-name">{d.barangay_name}</span>
                      <span className="coverage-vax">{d.vaccination_count.toLocaleString()}</span>
                      <span className="coverage-pets">{d.total_pets.toLocaleString()}</span>
                      <div className="coverage-rate-cell">
                        <div className="coverage-rate-track">
                          <div
                            className="coverage-rate-fill"
                            style={{ width: `${Math.min(d.coverage_rate, 100)}%` }}
                          />
                        </div>
                        <span className="coverage-rate-pct">{d.coverage_rate}%</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {!isSearching && allData.length > 10 && (
                <p className="coverage-hint">
                  Showing top 10 — type a barangay name to search all {allData.length} barangays.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── R Engine status panel (unchanged) ───────────────────────────
function REnginePanel() {
  const [status, setStatus] = useState('idle')
  const [ping, setPing]     = useState(null)
  const [testDb, setTestDb] = useState(null)
  const [error, setError]   = useState(null)

  async function check() {
    setStatus('checking'); setPing(null); setTestDb(null); setError(null)
    try {
      const p = await api.analytics.ping()
      setPing(p)
      const t = await api.analytics.testDb()
      setTestDb(t)
      setStatus(t.status === 'ok' ? 'ok' : 'error')
    } catch (err) {
      setError(err.message)
      setStatus('offline')
    }
  }

  useEffect(() => { check() }, [])

  const dot = { idle:'r-dot--idle', checking:'r-dot--checking', ok:'r-dot--ok', offline:'r-dot--offline', error:'r-dot--error' }[status]
  const label = { idle:'Not checked', checking:'Checking…', ok:'Connected', offline:'Offline', error:'Error' }[status]

  return (
    <div className={`r-panel r-panel--${status}`}>
      <div className="r-panel-head">
        <div className="r-panel-title-row">
          <span className={`r-dot ${dot}`} aria-hidden="true" />
          <span className="r-panel-title">R Analytics Engine</span>
          <span className="r-panel-status-label">{label}</span>
        </div>
        <button type="button" className="btn btn-outline r-panel-btn" onClick={check} disabled={status === 'checking'}>
          {status === 'checking' ? 'Checking…' : status === 'ok' ? 'Re-run test' : 'Connect'}
        </button>
      </div>

      {status === 'offline' && (
        <div className="r-panel-body r-panel-body--offline">
          <p>R Plumber is not running. Start it from RStudio:</p>
          <code className="r-code">plumber::plumb("r-api/plumber.R")$run(port = 8000)</code>
          <p className="r-hint">Or double-click <strong>start-r-api.bat</strong></p>
          {error && <p className="r-error-detail">{error}</p>}
        </div>
      )}

      {status === 'ok' && testDb && (
        <div className="r-panel-body">
          <div className="r-test-grid">
            <div className="r-test-row"><span className="r-test-label">Database</span><span className="r-test-value">{testDb.database}</span></div>
            <div className="r-test-row"><span className="r-test-label">Vaccinations</span><span className="r-test-value r-test-value--accent">{testDb.total_vaccinations?.toLocaleString()}</span></div>
            <div className="r-test-row"><span className="r-test-label">Pets</span><span className="r-test-value">{testDb.total_pets?.toLocaleString()}</span></div>
            <div className="r-test-row"><span className="r-test-label">Owners</span><span className="r-test-value">{testDb.total_owners?.toLocaleString()}</span></div>
            <div className="r-test-row"><span className="r-test-label">Engine</span><span className="r-test-value">Plumber {ping?.version}</span></div>
          </div>
          <p className="r-success-msg">✓ {testDb.message}</p>
        </div>
      )}
    </div>
  )
}
