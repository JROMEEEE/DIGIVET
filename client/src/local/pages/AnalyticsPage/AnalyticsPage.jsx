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
        {/* Row 1 — full width */}
        <BarangayCoverageChart onViewAll={() => setShowCoverageModal(true)} />

        {/* Row 2 — side by side */}
        <MonthlyTrendsChart />
        <PetTypeBreakdown />

        {/* Row 3 — full width */}
        <ClusteringAnalytics />

        {/* Row 4 — full width placeholder */}
        <div className="analytics-placeholder analytics-placeholder--wide">
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

// ── Barangay clustering ──────────────────────────────────────────
const CLUSTER_CFG = {
  'HIGH RISK':     { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', desc: 'Needs immediate outreach' },
  'MODERATE RISK': { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', desc: 'Monitor closely'          },
  'HEALTHY':       { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', desc: 'Well covered'             },
}

function silhouetteLabel(score) {
  if (score >= 0.6) return { label: 'Good clustering',       cls: 'sil--good'       }
  if (score >= 0.4) return { label: 'Acceptable clustering', cls: 'sil--acceptable' }
  return                   { label: 'Poor clustering',        cls: 'sil--poor'       }
}

function ClusteringAnalytics() {
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [offline, setOffline]     = useState(false)
  const [error, setError]         = useState(null)
  const [detailTarget, setDetailTarget]   = useState(null)
  const [showAllBarangays, setShowAllBarangays] = useState(false)

  useEffect(() => {
    api.analytics.clustering()
      .then((res) => {
        if (res.status === 'ok' || res.status === 'insufficient_data') setResult(res)
        else setError(res.message)
        setLoading(false)
      })
      .catch((err) => {
        if (err.status === 503) setOffline(true)
        else setError(err.detail ?? err.message)
        setLoading(false)
      })
  }, [])

  const sil = result ? silhouetteLabel(result.silhouette_score) : null
  const summary = result?.cluster_summary ?? []
  const barangays = result?.barangays ?? []

  const countFor = (label) => summary.find((s) => s.cluster === label)?.count ?? 0
  const avgFor   = (label) => summary.find((s) => s.cluster === label)?.avg_coverage ?? 0

  return (
    <div
      className="analytics-placeholder analytics-placeholder--wide analytics-chart-card cluster-card"
      onClick={() => !loading && !offline && setShowAllBarangays(true)}
      style={{ cursor: !loading && !offline ? 'pointer' : 'default' }}
    >
      <div className="chart-header">
        <div>
          <span className="chart-title">Barangay Risk Classification</span>
          <span className="chart-sub">K-Means clustering (k=3) · click card to view all barangays</span>
        </div>
        {!loading && !offline && (
          <button
            type="button"
            className="chart-view-btn"
            onClick={(e) => { e.stopPropagation(); setShowAllBarangays(true) }}
          >
            All barangays →
          </button>
        )}
      </div>

      {loading ? (
        <p className="chart-state">Running clustering in R…</p>
      ) : offline ? (
        <p className="chart-state chart-state--offline">R engine offline — start the API to run clustering.</p>
      ) : result?.status === 'insufficient_data' ? (
        <p className="chart-state">{result.message}</p>
      ) : error ? (
        <p className="chart-state chart-state--offline">{error}</p>
      ) : (
        <>
          {/* Silhouette score panel */}
          <div className="sil-panel">
            <div className="sil-score-box">
              <span className="sil-label-sm">SILHOUETTE SCORE</span>
              <span className={`sil-score ${sil.cls}`}>{result.silhouette_score}</span>
              <span className={`sil-verdict ${sil.cls}`}>{sil.label.toUpperCase()}</span>
            </div>
            <div className="sil-info">
              <p className="sil-explain">
                The Silhouette Score measures how well the system grouped the barangays.
                A score near <strong>1.0</strong> means clusters are very distinct.
                Near <strong>0.5</strong> is acceptable. Near <strong>0</strong> means overlap.
              </p>
              <div className="sil-bar-wrap">
                <div className="sil-bar" />
                <div
                  className="sil-marker"
                  style={{ left: `${result.silhouette_score * 100}%` }}
                />
                <div className="sil-bar-labels">
                  <span>0.0 — Poor</span>
                  <span>0.5 — Acceptable</span>
                  <span>1.0 — Perfect</span>
                </div>
              </div>
              <p className="sil-method">
                Computed by: {result.method} · {result.n_barangays} barangays analyzed
              </p>
            </div>
          </div>

          {/* Cluster summary cards */}
          <div className="cluster-summary">
            {['HIGH RISK', 'MODERATE RISK', 'HEALTHY'].map((lbl) => {
              const cfg = CLUSTER_CFG[lbl]
              return (
                <div key={lbl} className="cluster-summary-card" style={{ background: cfg.bg, borderColor: cfg.border }}>
                  <span className="cs-count" style={{ color: cfg.color }}>{countFor(lbl)}</span>
                  <span className="cs-label" style={{ color: cfg.color }}>{lbl}</span>
                  <span className="cs-desc">{cfg.desc}</span>
                  <span className="cs-avg">Avg coverage {avgFor(lbl)}%</span>
                </div>
              )
            })}
          </div>

          {/* Barangay cards grouped by cluster */}
          {['HIGH RISK', 'MODERATE RISK', 'HEALTHY'].map((lbl) => {
            const cfg   = CLUSTER_CFG[lbl]
            const items = barangays.filter((b) => b.cluster_label === lbl)
            if (!items.length) return null
            return (
              <div key={lbl} className="cluster-group">
                <h4 className="cluster-group-title" style={{ color: cfg.color }}>{lbl}</h4>
                <div className="cluster-brgy-grid">
                  {items.map((b) => (
                    <button
                      key={b.barangay_name}
                      type="button"
                      className="cluster-brgy-card cluster-brgy-card--btn"
                      style={{ borderColor: cfg.border, background: cfg.bg }}
                      onClick={(e) => { e.stopPropagation(); setDetailTarget({ name: b.barangay_name, label: lbl }) }}
                      title={`View ${b.barangay_name} detail`}
                    >
                      <span className="cbc-badge" style={{ background: cfg.color }}>{lbl.split(' ')[0]}</span>
                      <span className="cbc-name">{b.barangay_name}</span>
                      <div className="cbc-coverage-bar-wrap">
                        <div className="cbc-coverage-bar">
                          <div
                            className="cbc-coverage-fill"
                            style={{ width: `${Math.min(b.coverage_rate, 100)}%`, background: cfg.color }}
                          />
                        </div>
                        <span className="cbc-coverage-pct" style={{ color: cfg.color }}>{b.coverage_rate}%</span>
                      </div>
                      <div className="cbc-stats">
                        <span>Pets: {b.total_pets}</span>
                        <span>Missed: {b.missed}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}

      {showAllBarangays && (
        <AllBarangaysModal
          onClose={() => setShowAllBarangays(false)}
          onSelectBarangay={(name, label) => {
            setShowAllBarangays(false)
            setDetailTarget({ name, label: label ?? 'HEALTHY' })
          }}
        />
      )}

      {detailTarget && (
        <BarangayRiskDetailModal
          name={detailTarget.name}
          clusterLabel={detailTarget.label}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  )
}

// ── All barangays classified modal ──────────────────────────────
function AllBarangaysModal({ onClose, onSelectBarangay }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.analytics.allBarangaysClassified()
      .then((res) => { setRows(res.barangays ?? []); setLoading(false) })
      .catch((err) => { setError(err.detail ?? err.message); setLoading(false) })
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = q ? rows.filter((r) => r.barangay_name.toLowerCase().includes(q)) : rows

  const noRecord   = filtered.filter((r) => r.total_pets === 0).length
  const withRecord = filtered.length - noRecord

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">All Barangays — Classification</h3>
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
            {loading ? '…' : `${withRecord} with data · ${noRecord} no record`}
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
              <div className="ab-col-head">
                <span>Barangay</span>
                <span>Classification</span>
                <span>Coverage</span>
                <span>Pets</span>
                <span>Owners</span>
              </div>
              <ul className="ab-list">
                {filtered.map((r) => {
                  const cfg = r.cluster_label ? CLUSTER_CFG[r.cluster_label] : null
                  const hasData = r.total_pets > 0
                  return (
                    <li
                      key={r.barangay_id}
                      className={`ab-row${hasData ? ' ab-row--clickable' : ''}`}
                      onClick={() => hasData && onSelectBarangay(r.barangay_name, r.cluster_label)}
                    >
                      <span className="ab-name">{r.barangay_name}</span>
                      <span>
                        {!hasData ? (
                          <span className="ab-no-record">No record</span>
                        ) : (
                          <span className="ab-badge" style={{ background: cfg?.color, color: '#fff' }}>
                            {r.cluster_label}
                          </span>
                        )}
                      </span>
                      <span className="ab-coverage">
                        {hasData ? (
                          <div className="ab-coverage-wrap">
                            <div className="ab-coverage-bar">
                              <div
                                className="ab-coverage-fill"
                                style={{ width: `${r.coverage_rate}%`, background: cfg?.color }}
                              />
                            </div>
                            <span style={{ color: cfg?.color, fontWeight: 600 }}>{r.coverage_rate}%</span>
                          </div>
                        ) : '—'}
                      </span>
                      <span className="ab-count">{hasData ? r.total_pets : '—'}</span>
                      <span className="ab-count">{hasData ? r.total_owners : '—'}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Barangay risk detail modal ───────────────────────────────────
function BarangayRiskDetailModal({ name, clusterLabel, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')

  const cfg = CLUSTER_CFG[clusterLabel] ?? CLUSTER_CFG['HEALTHY']

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.analytics.barangayRiskDetail(name)
      .then((res) => { setData(res); setLoading(false) })
      .catch((err) => { setError(err.detail ?? err.message); setLoading(false) })
  }, [name])

  function fmtDate(d) {
    if (!d) return '—'
    const s = String(d)
    return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString()
  }

  const brgy = data?.barangay
  const pets = data?.pets ?? []
  const q    = search.trim().toLowerCase()
  const filtered = q
    ? pets.filter((p) => p.pet_name?.toLowerCase().includes(q) || p.owner_name?.toLowerCase().includes(q))
    : pets

  const vaccinatedCount   = pets.filter((p) => p.is_vaccinated).length
  const unvaccinatedCount = pets.length - vaccinatedCount
  const coveragePct = pets.length ? Math.round((vaccinatedCount / pets.length) * 100) : 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span className="cbc-badge" style={{ background: cfg.color, fontSize: '0.7rem', padding: '3px 10px' }}>
              {clusterLabel}
            </span>
            <h3 className="modal-title">{name}</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        {!loading && brgy && (
          <div className="brd-stats-bar" style={{ borderColor: cfg.border, background: cfg.bg }}>
            <div className="brd-stat">
              <span className="brd-stat-val">{brgy.total_pets}</span>
              <span className="brd-stat-lbl">Total Pets</span>
            </div>
            <div className="brd-stat">
              <span className="brd-stat-val" style={{ color: '#16a34a' }}>{vaccinatedCount}</span>
              <span className="brd-stat-lbl">Vaccinated</span>
            </div>
            <div className="brd-stat">
              <span className="brd-stat-val" style={{ color: '#dc2626' }}>{unvaccinatedCount}</span>
              <span className="brd-stat-lbl">Missed</span>
            </div>
            <div className="brd-stat">
              <span className="brd-stat-val" style={{ color: cfg.color }}>{coveragePct}%</span>
              <span className="brd-stat-lbl">Coverage</span>
            </div>
            <div className="brd-stat brd-stat--bar">
              <div className="brd-coverage-track">
                <div className="brd-coverage-fill" style={{ width: `${coveragePct}%`, background: cfg.color }} />
              </div>
            </div>
          </div>
        )}

        <div className="modal-search-bar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by pet name or owner…"
            className="encode-input"
            autoFocus
          />
          <span className="modal-result-count">
            {loading ? '…' : `${filtered.length} pet${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="modal-scroll">
          {loading ? (
            <p className="modal-state">Loading…</p>
          ) : error ? (
            <p className="modal-state">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="modal-state">No results{q ? ` for "${search}"` : ''}.</p>
          ) : (
            <>
              <div className="brd-col-head">
                <span>Pet</span>
                <span>Type</span>
                <span>Owner</span>
                <span>Vaccinations</span>
                <span>Last Vaccinated</span>
                <span>Status</span>
              </div>
              <ul className="brd-list">
                {filtered.map((p, i) => (
                  <li key={p.pet_id ?? i} className={`brd-row${p.is_vaccinated ? '' : ' brd-row--missed'}`}>
                    <span className="brd-pet-name">{p.pet_name}</span>
                    <span className="brd-pet-type">{p.pet_type}</span>
                    <span className="brd-owner">{p.owner_name}</span>
                    <span className="brd-vax-count">{p.vaccination_count}</span>
                    <span className="brd-last">{fmtDate(p.last_vaccinated)}</span>
                    <span className={`brd-status${p.is_vaccinated ? ' brd-status--ok' : ' brd-status--miss'}`}>
                      {p.is_vaccinated ? '✓ Vaccinated' : '✗ Not yet'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pet type breakdown ───────────────────────────────────────────
const TYPE_COLORS = ['#7a1f2b', '#1d4ed8', '#16a34a', '#d97706', '#7c3aed', '#0891b2']

function PetTypeBreakdown() {
  const [data, setData]         = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [offline, setOffline]   = useState(false)
  const [selected, setSelected] = useState(null) // pet_type string

  useEffect(() => {
    api.analytics.petTypeBreakdown()
      .then((res) => {
        if (res.status === 'ok') { setData(res.data ?? []); setTotal(res.total_pets ?? 0) }
        else setOffline(true)
        setLoading(false)
      })
      .catch(() => { setOffline(true); setLoading(false) })
  }, [])

  return (
    <>
      <div
        className="analytics-placeholder analytics-chart-card"
        style={{ cursor: data.length > 0 ? 'default' : 'default' }}
      >
        <div className="chart-header">
          <div>
            <span className="chart-title">Pet Type Breakdown</span>
            <span className="chart-sub">{loading ? '…' : `${total.toLocaleString()} registered pets`}</span>
          </div>
        </div>

        {loading ? (
          <p className="chart-state">Loading from R…</p>
        ) : offline ? (
          <p className="chart-state chart-state--offline">R engine offline — start the API to load charts.</p>
        ) : data.length === 0 ? (
          <p className="chart-state">No pet data yet.</p>
        ) : (
          <div className="ptb-list">
            {data.map((d, i) => (
              <button
                key={d.pet_type}
                type="button"
                className="ptb-row"
                onClick={() => setSelected(d.pet_type)}
                title={`View ${d.pet_type} details`}
              >
                <span className="ptb-dot" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                <span className="ptb-type">{d.pet_type}</span>
                <div className="ptb-track">
                  <div
                    className="ptb-fill"
                    style={{
                      width: `${d.pct}%`,
                      background: TYPE_COLORS[i % TYPE_COLORS.length],
                    }}
                  />
                </div>
                <span className="ptb-pct">{d.pct}%</span>
                <span className="ptb-count">{d.pet_count.toLocaleString()}</span>
                <span className="ptb-vax">{d.vaccination_count.toLocaleString()} vax</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <PetTypeDetailModal
          type={selected}
          color={TYPE_COLORS[data.findIndex((d) => d.pet_type === selected) % TYPE_COLORS.length]}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

function PetTypeDetailModal({ type, color, onClose }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.analytics.petTypeDetail(type)
      .then((res) => {
        if (res.status === 'ok') setRows(res.data ?? [])
        else setError(res.message)
        setLoading(false)
      })
      .catch((err) => { setError(err.detail ?? err.message); setLoading(false) })
  }, [type])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? rows.filter((r) =>
        r.pet_name?.toLowerCase().includes(q) ||
        r.owner_name?.toLowerCase().includes(q)
      )
    : rows

  function fmtDate(d) {
    if (!d) return '—'
    const s = String(d)
    return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="ptbd-type-badge" style={{ background: color }}>{type}</span>
            <h3 className="modal-title">{type} Records</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-search-bar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by pet name or owner…"
            className="encode-input"
            autoFocus
          />
          <span className="modal-result-count">
            {loading ? '…' : `${filtered.length} pet${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="modal-scroll">
          {loading ? (
            <p className="modal-state">Loading…</p>
          ) : error ? (
            <p className="modal-state">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="modal-state">No results{q ? ` for "${search}"` : ''}.</p>
          ) : (
            <>
              <div className="ptbd-col-head">
                <span>Pet</span>
                <span>Age / Color</span>
                <span>Owner</span>
                <span>Barangay</span>
                <span>Vaccinations</span>
                <span>Last Vaccinated</span>
              </div>
              <ul className="ptbd-list">
                {filtered.map((r, i) => (
                  <li key={i} className="ptbd-row">
                    <span className="ptbd-name">{r.pet_name}</span>
                    <span className="ptbd-age">{r.pet_age ?? '—'} · {r.pet_color ?? '—'}</span>
                    <span className="ptbd-owner">{r.owner_name ?? '—'}</span>
                    <span className="ptbd-brgy">{r.barangay_name ?? '—'}</span>
                    <span className="ptbd-vax">{r.vaccination_count}</span>
                    <span className="ptbd-last">{fmtDate(r.last_vaccinated)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
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
                <span>Vaccinated Pets</span>
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
                      <span className="coverage-vax">{d.vaccinated_pets?.toLocaleString() ?? d.vaccination_count.toLocaleString()}</span>
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

// ── Monthly trends vertical bar chart ───────────────────────────
function MonthlyTrendsChart() {
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [offline, setOffline]       = useState(false)
  const [hovered, setHovered]       = useState(null)
  const [selected, setSelected]     = useState(null)   // specific bar → month detail
  const [showOverview, setShowOverview] = useState(false) // card click → overview

  useEffect(() => {
    api.analytics.monthlyTrends({ months: 12 })
      .then((res) => {
        if (res.status === 'ok') setData(res.data ?? [])
        else setOffline(true)
        setLoading(false)
      })
      .catch(() => { setOffline(true); setLoading(false) })
  }, [])

  const max = data.length ? Math.max(...data.map((d) => d.vaccination_count), 1) : 1

  return (
    <>
      {/* Card — clicking the background opens the overview */}
      <div
        className="analytics-placeholder analytics-chart-card"
        onClick={() => data.length > 0 && setShowOverview(true)}
        style={{ cursor: data.length > 0 ? 'pointer' : 'default' }}
      >
        <div className="chart-header">
          <div>
            <span className="chart-title">Monthly Vaccination Trends</span>
            <span className="chart-sub">Last 12 months · click bar for month detail</span>
          </div>
          {!loading && !offline && data.length > 0 && (
            <button
              type="button"
              className="chart-view-btn"
              onClick={(e) => { e.stopPropagation(); setShowOverview(true) }}
            >
              Overview →
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
          <p className="chart-state">No data for the last 12 months.</p>
        ) : (
          <div className="monthly-chart" onClick={(e) => e.stopPropagation()}>
            <div className="monthly-y-axis">
              <span>{max.toLocaleString()}</span>
              <span>{Math.round(max / 2).toLocaleString()}</span>
              <span>0</span>
            </div>
            <div className="monthly-chart-inner">
              <div className="monthly-bars">
                {data.map((d) => (
                  <div
                    key={d.year_month}
                    className={`monthly-col${hovered === d.year_month ? ' is-hovered' : ''}${selected?.year_month === d.year_month ? ' is-selected' : ''}`}
                    onMouseEnter={() => setHovered(d.year_month)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected({ year_month: d.year_month, label: d.label })
                    }}
                    title={`${d.label} — ${d.vaccination_count} vaccinations`}
                  >
                    {hovered === d.year_month && (
                      <span className="monthly-tooltip">
                        {d.vaccination_count.toLocaleString()}
                      </span>
                    )}
                    <div
                      className="monthly-bar"
                      style={{ height: `${(d.vaccination_count / max) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="monthly-labels">
                {data.map((d) => (
                  <span
                    key={d.year_month}
                    className={`monthly-label${selected?.year_month === d.year_month ? ' is-selected' : ''}`}
                  >
                    {d.label.split(' ')[0]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showOverview && (
        <MonthlyOverviewModal data={data} onClose={() => setShowOverview(false)} />
      )}

      {selected && (
        <MonthlyDetailModal
          month={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

// ── Monthly overview modal (card-level click) ────────────────────
function MonthlyOverviewModal({ data, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const total   = data.reduce((s, d) => s + d.vaccination_count, 0)
  const avg     = data.length ? Math.round(total / data.length) : 0
  const peak    = data.reduce((best, d) => d.vaccination_count > best.vaccination_count ? d : best, data[0])
  const lowest  = data.reduce((low,  d) => d.vaccination_count < low.vaccination_count  ? d : low,  data[0])

  // Trend: compare last 3 months vs first 3 months
  const first3 = data.slice(0, 3).reduce((s, d) => s + d.vaccination_count, 0)
  const last3  = data.slice(-3).reduce((s, d) => s + d.vaccination_count, 0)
  const trend  = last3 > first3 ? '↑ Growing' : last3 < first3 ? '↓ Declining' : '→ Stable'
  const trendCls = last3 > first3 ? 'mov-trend--up' : last3 < first3 ? 'mov-trend--down' : 'mov-trend--flat'

  // Per-month change vs previous
  const rows = data.map((d, i) => {
    const prev   = i > 0 ? data[i - 1].vaccination_count : null
    const change = prev !== null ? d.vaccination_count - prev : null
    const pct    = prev !== null && prev > 0 ? Math.round((change / prev) * 100) : null
    return { ...d, change, pct }
  })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">Monthly Vaccination — Overview</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-scroll">
          {/* Summary stat cards */}
          <div className="mov-stats">
            <div className="mov-stat">
              <span className="mov-stat-value">{total.toLocaleString()}</span>
              <span className="mov-stat-label">Total vaccinations</span>
            </div>
            <div className="mov-stat">
              <span className="mov-stat-value">{avg.toLocaleString()}</span>
              <span className="mov-stat-label">Monthly average</span>
            </div>
            <div className="mov-stat">
              <span className="mov-stat-value">{peak?.vaccination_count}</span>
              <span className="mov-stat-label">Peak · {peak?.label}</span>
            </div>
            <div className="mov-stat">
              <span className={`mov-trend ${trendCls}`}>{trend}</span>
              <span className="mov-stat-label">vs. 3 months ago</span>
            </div>
          </div>

          {/* Month-by-month table */}
          <div className="mov-table">
            <div className="mov-table-head">
              <span>Month</span>
              <span>Vaccinations</span>
              <span>vs Previous</span>
              <span>Trend bar</span>
            </div>
            {[...rows].reverse().map((d) => {
              const up   = d.change !== null && d.change > 0
              const down = d.change !== null && d.change < 0
              return (
                <div key={d.year_month} className="mov-table-row">
                  <span className="mov-month">{d.label}</span>
                  <span className="mov-count">{d.vaccination_count.toLocaleString()}</span>
                  <span className={`mov-change${up ? ' mov-change--up' : down ? ' mov-change--down' : ''}`}>
                    {d.change === null ? '—'
                      : `${up ? '+' : ''}${d.change} ${d.pct !== null ? `(${up ? '+' : ''}${d.pct}%)` : ''}`}
                  </span>
                  <div className="mov-bar-track">
                    <div
                      className="mov-bar-fill"
                      style={{ width: `${(d.vaccination_count / (peak?.vaccination_count || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {lowest && (
            <p className="mov-footnote">
              Lowest month: <strong>{lowest.label}</strong> ({lowest.vaccination_count} vaccinations)
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Monthly detail modal ─────────────────────────────────────────
function MonthlyDetailModal({ month, onClose }) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.analytics.monthlyDetail(month.year_month)
      .then((res) => {
        if (res.status === 'ok') setDetail(res)
        else setError(res.message)
        setLoading(false)
      })
      .catch((err) => { setError(err.detail ?? err.message); setLoading(false) })
  }, [month.year_month])

  function MiniBar({ items }) {
    const maxCount = Math.max(...items.map((i) => i.count), 1)
    return (
      <ul className="mdetail-bar-list">
        {items.map((item) => (
          <li key={item.label} className="mdetail-bar-row">
            <span className="mdetail-bar-label" title={item.label}>{item.label}</span>
            <div className="mdetail-bar-track">
              <div className="mdetail-bar-fill" style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
            <span className="mdetail-bar-count">{item.count}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 className="modal-title">{month.label}</h3>
            {detail && (
              <span className="mdetail-total">{detail.total.toLocaleString()} vaccinations</span>
            )}
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-scroll">
          {loading ? (
            <p className="modal-state">Loading…</p>
          ) : error ? (
            <p className="modal-state">{error}</p>
          ) : (
            <div className="mdetail-body">
              <div className="mdetail-sections">
                <section className="mdetail-section">
                  <h4 className="mdetail-section-title">By Vaccine</h4>
                  <MiniBar items={detail.by_vaccine} />
                </section>
                <section className="mdetail-section">
                  <h4 className="mdetail-section-title">By Barangay</h4>
                  <MiniBar items={detail.by_barangay} />
                </section>
              </div>

              <section className="mdetail-section mdetail-section--full">
                <h4 className="mdetail-section-title">Records this month</h4>
                <div className="mdetail-entries">
                  <div className="mdetail-entry-head">
                    <span>Date</span><span>Pet</span><span>Owner</span>
                    <span>Vaccine</span><span>Vet</span><span>Code</span>
                  </div>
                  {detail.entries.map((e, i) => (
                    <div key={i} className="mdetail-entry-row">
                      <span className="mdetail-e-date">{e.date_label}</span>
                      <span className="mdetail-e-pet">{e.pet_name} <span className="mdetail-e-type">{e.pet_type}</span></span>
                      <span className="mdetail-e-owner">{e.owner_name}</span>
                      <span className="mdetail-e-vaccine">{e.vaccine_details}</span>
                      <span className="mdetail-e-vet">{e.vet_name ?? '—'}</span>
                      <span className="mdetail-e-code">{e.approval_code ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
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
