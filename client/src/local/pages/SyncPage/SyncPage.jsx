import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [phase, setPhase]           = useState('idle')
  const [syncResults, setSyncResults] = useState(null)
  const [syncError, setSyncError]     = useState(null)
  const [tableModal, setTableModal]   = useState(null)
  const [showLog, setShowLog]         = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [mirror, setMirror]           = useState(null)   // mirror-status result
  const [mirrorLoading, setMirrorLoading] = useState(false)
  const mirrorTimer = useRef(null)

  useEffect(() => {
    api.sync.status()
      .then((d) => { setStatus(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Poll mirror status every 30 s when Supabase is connected
  const checkMirror = useCallback(() => {
    if (mirrorLoading) return
    setMirrorLoading(true)
    api.sync.mirrorStatus()
      .then((d) => { setMirror(d); setMirrorLoading(false) })
      .catch(() => setMirrorLoading(false))
  }, [mirrorLoading])

  useEffect(() => {
    if (!status?.connected) return
    checkMirror()
    mirrorTimer.current = setInterval(checkMirror, 30000)
    return () => clearInterval(mirrorTimer.current)
  }, [status?.connected]) // eslint-disable-line

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
        </div>
        <div className="sync-last">
          <span className="sync-last-label">Last sync</span>
          <span className="sync-last-val">
            {last ? `${timeAgo(last.last_sync_at)} · ${last.records_synced} records` : 'Never'}
          </span>
        </div>
      </div>

      {/* Mirror status */}
      {status?.connected && (
        <div className={`mirror-card ${
          mirrorLoading && !mirror ? 'mirror-card--loading'
          : mirror?.mirrored        ? 'mirror-card--ok'
          :                           'mirror-card--diff'
        }`}>
          <div className="mirror-card-head">
            <span className={`mirror-dot ${mirror?.mirrored ? 'mirror-dot--ok' : 'mirror-dot--diff'}`} />
            <div className="mirror-card-info">
              <span className="mirror-card-title">
                {!mirror && mirrorLoading ? 'Checking Supabase…'
                  : mirror?.mirrored ? 'Local DB mirrors Supabase'
                  : `Supabase has ${mirror?.total_diffs} table${mirror?.total_diffs !== 1 ? 's' : ''} with changes`}
              </span>
              <span className="mirror-card-sub">
                {mirror?.checked_at ? `Last checked ${timeAgo(mirror.checked_at)} · auto-refreshes every 30 s` : 'Polling Supabase for changes…'}
              </span>
            </div>
            <div className="mirror-card-actions">
              <button type="button" className="mirror-refresh-btn" onClick={checkMirror} disabled={mirrorLoading} title="Check now">
                {mirrorLoading ? '…' : '↻'}
              </button>
              {mirror && !mirror.mirrored && (
                <>
                  <button type="button" className="btn btn-outline mirror-pull-btn"
                    onClick={() => setShowCompare(true)}>
                    View diff
                  </button>
                  <button type="button" className="btn btn-primary mirror-pull-btn"
                    onClick={() => setPhase('pull-confirm')}>
                    Pull Changes
                  </button>
                </>
              )}
            </div>
          </div>

          {mirror && !mirror.mirrored && (
            <ul className="mirror-table-list">
              {mirror.tables.filter(t => !t.in_sync && !t.error).map(t => (
                <li key={t.name} className="mirror-table-row">
                  <span className="mirror-table-name">{TABLE_LABELS[t.name] ?? t.name}</span>
                  <span className="mirror-table-detail">
                    {t.count_diff && (
                      <span className="mirror-badge mirror-badge--count">
                        Local {t.local_count} · Supabase {t.supabase_count}
                      </span>
                    )}
                    {t.newer_in_supabase && (
                      <span className="mirror-badge mirror-badge--newer">
                        Supabase has newer data
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Table grid */}
      <section className="sync-section">
        <h3 className="sync-section-title">
          {status?.is_first_sync ? 'All records (first sync)' : 'Pending changes since last sync'}
        </h3>
        <div className="sync-table-grid">
          {loading ? (
            <p className="sync-hint">Loading…</p>
          ) : (
            <>
              {status?.tables?.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className={`sync-table-card sync-table-card--btn${t.pending_count === 0 ? ' sync-table-card--clean' : ''}`}
                  onClick={() => setTableModal(t.name)}
                >
                  <span className="sync-table-name">{TABLE_LABELS[t.name] ?? t.name}</span>
                  <span className="sync-table-count">{t.pending_count.toLocaleString()}</span>
                  <span className="sync-table-label">
                    {t.pending_count === 0 ? 'up to date' : 'pending'}
                  </span>
                  <span className="sync-table-chevron">→</span>
                </button>
              ))}
              <button
                type="button"
                className="sync-table-card sync-table-card--btn sync-table-card--log"
                onClick={() => setShowLog(true)}
              >
                <span className="sync-table-name">General Log</span>
                <span className="sync-table-count">{totalLocal}</span>
                <span className="sync-table-label">all changes</span>
                <span className="sync-table-chevron">→</span>
              </button>
            </>
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
          <h3 className="sync-section-title">
            {syncResults.direction === 'pull' ? 'Pull results' : 'Sync results'}
          </h3>
          <div className="sync-results">
            {syncResults.results.map((r) => (
              <div key={r.table} className={`sync-result-row sync-result-row--${r.status}`}>
                <span className="srr-icon">
                  {r.status === 'ok' ? '✓' : r.status === 'empty' ? '—' : '✗'}
                </span>
                <span className="srr-table">{TABLE_LABELS[r.table] ?? r.table}</span>
                <span className="srr-count">
                  {r.status === 'ok'
                    ? syncResults.direction === 'pull'
                      ? `${r.upserted} updated${r.deleted > 0 ? `, ${r.deleted} removed` : ''}`
                      : `${r.synced} synced`
                    : r.status}
                </span>
                {r.error && <span className="srr-error">{r.error}</span>}
              </div>
            ))}
          </div>
          <p className="sync-total">
            ✓ <strong>{(syncResults.total_synced ?? syncResults.total_pulled ?? 0).toLocaleString()}</strong>{' '}
            records {syncResults.direction === 'pull' ? 'pulled from Supabase' : 'pushed to Supabase'}
          </p>
          <button type="button" className="btn btn-outline" onClick={() => { setPhase('idle'); setSyncResults(null) }}>
            Done
          </button>
        </section>
      )}

      {tableModal && (
        <TablePendingModal
          tableName={tableModal}
          label={TABLE_LABELS[tableModal] ?? tableModal}
          onClose={() => setTableModal(null)}
        />
      )}

      {showLog && <GeneralLogModal onClose={() => setShowLog(false)} />}

      {showCompare && (
        <CompareModal
          onClose={() => setShowCompare(false)}
          onPull={() => {
            setShowCompare(false)
            setPhase('pull-confirm')
          }}
        />
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

      {/* Pull confirmation */}
      {phase === 'pull-confirm' && (
        <div className="modal-backdrop" onClick={() => setPhase('idle')}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Pull from Supabase</h3>
            <p style={{ margin: '12px 0 20px', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              This will overwrite local records with Supabase data and remove any
              local records that no longer exist in Supabase.
            </p>
            <div className="encode-form-actions">
              <button type="button" className="btn btn-outline" onClick={() => setPhase('idle')}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={async () => {
                setSyncResults(null)
                setSyncError(null)
                setPhase('pulling')
                try {
                  const result = await api.sync.pull()
                  setSyncResults(result)
                  setPhase('pull-done')
                  api.sync.status().then(setStatus).catch(() => {})
                  api.sync.mirrorStatus().then(setMirror).catch(() => {})
                } catch (err) {
                  setSyncError(err.detail ?? err.message ?? 'Pull failed — check server logs.')
                  setPhase('pull-done')
                }
              }}>
                Confirm Pull
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulling overlay */}
      {phase === 'pulling' && (
        <div className="sync-overlay">
          <div className="sync-overlay-card">
            <div className="sync-spinner" aria-hidden="true" />
            <p>Pulling records from Supabase…</p>
            <p className="sync-hint">Do not close this window.</p>
          </div>
        </div>
      )}

      {/* Pull results */}
      {phase === 'pull-done' && (
        <section className="sync-section">
          <h3 className="sync-section-title">Pull results</h3>
          {syncError ? (
            <div className="pull-result-error">
              <span className="pull-result-error-icon">✗</span>
              <div>
                <p className="pull-result-error-title">Pull failed</p>
                <p className="pull-result-error-msg">{syncError}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="sync-results">
                {(syncResults?.results ?? []).map((r) => (
                  <div key={r.table} className={`sync-result-row sync-result-row--${r.status}`}>
                    <span className="srr-icon">{r.status === 'ok' ? '✓' : '✗'}</span>
                    <span className="srr-table">{TABLE_LABELS[r.table] ?? r.table}</span>
                    <span className="srr-count">
                      {r.upserted} synced{r.deleted > 0 ? `, ${r.deleted} removed` : ''}
                      {r.errors?.length > 0 && ` · ${r.errors.length} skipped`}
                    </span>
                    {r.errors?.map((e, i) => (
                      <span key={i} className="srr-error">{e}</span>
                    ))}
                  </div>
                ))}
              </div>
              <p className="sync-total">
                ✓ <strong>{syncResults?.total_pulled ?? 0}</strong> records pulled from Supabase
              </p>
              <p className="sync-hint" style={{ marginTop: 4 }}>
                Refresh any open pages to see the updated data.
              </p>
            </>
          )}
          <button type="button" className="btn btn-outline" style={{ marginTop: 8 }}
            onClick={() => { setPhase('idle'); setSyncResults(null); setSyncError(null) }}>
            Done
          </button>
        </section>
      )}
    </main>
  )
}

/* ── Compare modal ──────────────────────────────────────────────── */
function CompareModal({ onClose, onPull }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.sync.compare()
      .then((d) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  const toggle = (tbl) => setExpanded((p) => ({ ...p, [tbl]: !p[tbl] }))

  const hasDiffs = data && data.total_diffs > 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 className="modal-title">Local ↔ Supabase Comparison</h3>
            <span className="spm-subtitle">
              {loading ? 'Checking…' : error ? 'Error' : hasDiffs
                ? `${data.total_diffs} difference${data.total_diffs !== 1 ? 's' : ''} found`
                : 'Both databases are in sync ✓'}
            </span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-scroll">
          {loading ? (
            <p className="modal-state">Comparing databases…</p>
          ) : error ? (
            <p className="modal-state">{error}</p>
          ) : (
            <div className="cmp-table-list">
              {data.results.map((t) => (
                <div key={t.table} className={`cmp-row${t.in_sync ? ' cmp-row--ok' : ' cmp-row--diff'}`}>
                  <button type="button" className="cmp-row-head" onClick={() => toggle(t.table)}>
                    <span className={`cmp-status-dot ${t.in_sync ? 'cmp-dot--ok' : 'cmp-dot--diff'}`} />
                    <span className="cmp-tbl-name">{TABLE_LABELS[t.table] ?? t.table}</span>
                    <span className="cmp-counts">
                      <span className="cmp-count-pill">Local: {t.local_count}</span>
                      <span className="cmp-count-pill">Supabase: {t.supabase_count}</span>
                    </span>
                    {!t.in_sync && (
                      <span className="cmp-diff-badge">
                        {(t.local_only?.length ?? 0) + (t.supabase_only?.length ?? 0) + (t.diverged?.length ?? 0)} diff
                      </span>
                    )}
                    <span className="cmp-chevron">{expanded[t.table] ? '▲' : '▼'}</span>
                  </button>

                  {expanded[t.table] && (
                    <div className="cmp-detail">
                      {t.in_sync ? (
                        <p className="cmp-detail-ok">✓ In sync</p>
                      ) : (
                        <>
                          {t.supabase_only?.length > 0 && (
                            <div className="cmp-diff-group">
                              <span className="cmp-diff-head cmp-diff-head--sb">
                                ↓ Only in Supabase ({t.supabase_only.length}) — will be pulled
                              </span>
                              <ul className="cmp-diff-list">
                                {t.supabase_only.map((r, i) => (
                                  <li key={i}><span className="cmp-dot-sb">●</span> {r.label ?? `#${r.pk_val}`} <span className="cmp-time">{timeAgo(r.updated_at)}</span></li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {t.local_only?.length > 0 && (
                            <div className="cmp-diff-group">
                              <span className="cmp-diff-head cmp-diff-head--local">
                                ↑ Only in Local ({t.local_only.length}) — push to sync
                              </span>
                              <ul className="cmp-diff-list">
                                {t.local_only.map((r, i) => (
                                  <li key={i}><span className="cmp-dot-local">●</span> {r.label ?? `#${r.pk_val}`} <span className="cmp-time">{timeAgo(r.updated_at)}</span></li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {t.diverged?.length > 0 && (
                            <div className="cmp-diff-group">
                              <span className="cmp-diff-head cmp-diff-head--div">
                                ⚡ Diverged ({t.diverged.length}) — same record, different data
                              </span>
                              <ul className="cmp-diff-list">
                                {t.diverged.map((r, i) => (
                                  <li key={i}>
                                    <span className="cmp-dot-div">●</span>
                                    {r.label ?? `#${r.pk_val}`}
                                    <span className={`cmp-newer-badge ${r.newer === 'supabase' ? 'cmp-newer--sb' : 'cmp-newer--local'}`}>
                                      {r.newer === 'supabase' ? 'Supabase newer' : 'Local newer'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && !error && hasDiffs && (
          <div className="modal-footer">
            <p className="cmp-footer-hint">Pull to apply Supabase changes to local, or Push to overwrite Supabase with local data.</p>
            <div className="cmp-footer-actions">
              <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
              <button type="button" className="btn btn-primary" onClick={onPull}>Pull from Supabase</button>
            </div>
          </div>
        )}
        {!loading && !error && !hasDiffs && (
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

// Human-readable summary per table row
const TABLE_ROW_LABEL = {
  barangay_table:      (r) => r.barangay_name,
  vet_table:           (r) => r.vet_name,
  owner_table:         (r) => `${r.owner_name} · ${r.contact_number ?? ''}`,
  pet_table:           (r) => `${r.pet_name} (${r.pet_type ?? ''})`,
  drive_session_table: (r) => `Session · ${r.session_date}`,
  approval_id_table:   (r) => r.approval_code,
  vaccine_table:       (r) => `${r.vaccine_details ?? ''} · ${r.vaccine_date ?? ''}`,
}

/* ── Per-table pending changes modal ───────────────────────────── */
function TablePendingModal({ tableName, label, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.sync.pending(tableName)
      .then((d) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.detail ?? e.message); setLoading(false) })
  }, [tableName])

  const getLabel = TABLE_ROW_LABEL[tableName] ?? ((r) => JSON.stringify(r).slice(0, 60))
  const activeCount  = data?.active?.length  ?? 0
  const deletedCount = data?.deleted?.length ?? 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 className="modal-title">{label}</h3>
            <span className="spm-subtitle">
              {data?.since
                ? `Changes since last sync · ${activeCount} pending · ${deletedCount} deleted`
                : `First sync — all ${activeCount} records`}
            </span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-scroll">
          {loading ? (
            <p className="modal-state">Loading…</p>
          ) : error ? (
            <p className="modal-state">{error}</p>
          ) : activeCount === 0 && deletedCount === 0 ? (
            <div className="spm-empty">
              <span className="spm-empty-icon">✓</span>
              <span>All up to date — nothing pending for {label}.</span>
            </div>
          ) : (
            <div className="spm-sections">
              {activeCount > 0 && (
                <div className="spm-section">
                  <div className="spm-section-head">
                    <span className="spm-badge spm-badge--add">↑ PUSH</span>
                    <span>{activeCount} record{activeCount !== 1 ? 's' : ''} will be added / updated in Supabase</span>
                  </div>
                  <ul className="spm-list">
                    {data.active.map((r, i) => (
                      <li key={i} className="spm-row">
                        <span className="spm-dot spm-dot--add" />
                        <span className="spm-label">{getLabel(r)}</span>
                        <span className="spm-time">{timeAgo(r.updated_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {deletedCount > 0 && (
                <div className="spm-section">
                  <div className="spm-section-head">
                    <span className="spm-badge spm-badge--del">✕ DELETE</span>
                    <span>{deletedCount} record{deletedCount !== 1 ? 's' : ''} will be removed from Supabase</span>
                  </div>
                  <ul className="spm-list">
                    {data.deleted.map((r, i) => (
                      <li key={i} className="spm-row spm-row--del">
                        <span className="spm-dot spm-dot--del" />
                        <span className="spm-label">{getLabel(r)}</span>
                        <span className="spm-time">{timeAgo(r.updated_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── General log modal ──────────────────────────────────────────── */
function GeneralLogModal({ onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    api.sync.log()
      .then((d) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.detail ?? e.message); setLoading(false) })
  }, [])

  const entries = data?.entries ?? []

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 className="modal-title">General Change Log</h3>
            <span className="spm-subtitle">
              {data?.since
                ? `All pending changes since last sync · ${entries.length} total`
                : `First sync — all ${entries.length} records`}
            </span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-scroll">
          {loading ? (
            <p className="modal-state">Loading…</p>
          ) : error ? (
            <p className="modal-state">{error}</p>
          ) : entries.length === 0 ? (
            <div className="spm-empty">
              <span className="spm-empty-icon">✓</span>
              <span>Everything is up to date — no pending changes.</span>
            </div>
          ) : (
            <ul className="spm-log-list">
              {entries.map((e, i) => (
                <li key={i} className={`spm-log-row${e.type === 'delete' ? ' spm-log-row--del' : ''}`}>
                  <span className={`spm-badge ${e.type === 'delete' ? 'spm-badge--del' : 'spm-badge--add'}`}>
                    {e.type === 'delete' ? '✕ DEL' : '↑ ADD'}
                  </span>
                  <span className="spm-log-table">{TABLE_LABELS[e.table] ?? e.table}</span>
                  <span className="spm-log-label">{e.label ?? `#${e.pk_val}`}</span>
                  <span className="spm-log-time">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
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
