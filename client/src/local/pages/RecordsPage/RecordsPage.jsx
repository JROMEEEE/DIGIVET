import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import './RecordsPage.css'

function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString()
}

export default function RecordsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions]         = useState([])
  const [vets, setVets]                 = useState([])
  const [sessionFilter, setSessionFilter]   = useState('')
  const [sessionSearch, setSessionSearch]   = useState('')
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [petSearch, setPetSearch]           = useState('')
  const [records, setRecords]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [editTarget, setEditTarget]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [flash, setFlash]               = useState(null)
  const [error, setError]               = useState(null)

  function flashMsg(msg) {
    setFlash(msg); setError(null)
    setTimeout(() => setFlash(null), 3500)
  }

  useEffect(() => {
    Promise.all([api.driveSessions.list(), api.vets.list()])
      .then(([ss, vs]) => { setSessions(ss); setVets(vs) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    setLoading(true)
    const params =
      sessionFilter === 'office' ? { is_office_visit: true } :
      sessionFilter              ? { session_id: Number(sessionFilter) } :
      {}
    api.vaccinations.listAll(params)
      .then((data) => { setRecords(data); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [sessionFilter])

  async function handleDelete(record) {
    try {
      await api.vaccinations.remove(record.vaccine_id)
      setRecords((prev) => prev.filter((r) => r.vaccine_id !== record.vaccine_id))
      setDeleteTarget(null)
      flashMsg('Record deleted.')
    } catch (err) {
      setError(err.message)
      setDeleteTarget(null)
    }
  }

  async function handleUpdate(id, form) {
    try {
      const updated = await api.vaccinations.update(id, form)
      const vetName = vets.find((v) => v.vet_id === Number(form.vet_id))?.vet_name
      setRecords((prev) =>
        prev.map((r) =>
          r.vaccine_id === id
            ? { ...r, ...updated, vet_name: vetName, vet_id: Number(form.vet_id) }
            : r
        )
      )
      setEditTarget(null)
      flashMsg('Record updated.')
    } catch (err) {
      setError(err.message)
    }
  }

  const selectedSession    = sessions.find((s) => String(s.session_id) === sessionFilter)
  const isPetOfficeFilter  = sessionFilter === 'office'
  const capped = !sessionFilter && records.length >= 500

  // Filter sessions list for the search input — always keep the currently selected session visible
  const filteredSessions = sessions.filter((s) =>
    String(s.session_id) === sessionFilter ||
    !sessionSearch.trim() ||
    (s.barangay_name ?? '').toLowerCase().includes(sessionSearch.toLowerCase())
  )

  // Client-side pet/owner search on already-loaded records
  const q = petSearch.trim().toLowerCase()
  const displayRecords = q
    ? records.filter((r) =>
        (r.pet_name ?? '').toLowerCase().includes(q) ||
        (r.owner_name ?? '').toLowerCase().includes(q)
      )
    : records

  return (
    <main className="records-page">
      <div className="records-header">
        <div>
          <h2 className="records-title">Records</h2>
          <p className="records-sub">All vaccination records. Filter by session, edit, or delete entries.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard/encode')}>
          + New record
        </button>
      </div>

      {error && <div className="encode-banner encode-banner--error">{error}</div>}
      {flash && <div className="encode-banner encode-banner--ok">{flash}</div>}

      <div className="records-topbar">
        <div className="records-count">
          {loading ? (
            <span className="records-count-num">…</span>
          ) : q ? (
            <>
              <span className="records-count-num">{displayRecords.length}</span>
              <span className="records-count-label">of {records.length}</span>
              <span className="records-count-label">
                {isPetOfficeFilter
                  ? '— Pet Office'
                  : selectedSession
                  ? `in ${selectedSession.barangay_name} · ${fmtDate(selectedSession.session_date)}`
                  : 'total records'}
              </span>
            </>
          ) : (
            <>
              <span className="records-count-num">{records.length}</span>
              <span className="records-count-label">
                {isPetOfficeFilter
                  ? 'records — Pet Office'
                  : selectedSession
                  ? `records in ${selectedSession.barangay_name} · ${fmtDate(selectedSession.session_date)}`
                  : 'total records'}
              </span>
            </>
          )}
          {capped && (
            <span className="records-capped">Showing first 500 — filter by session to see all</span>
          )}
        </div>

        <div className="records-filter">
          <span className="records-filter-label">Filter by session</span>
          <div className="records-filter-row">
            <button
              type="button"
              className={`records-session-btn${sessionFilter ? ' has-value' : ''}`}
              onClick={() => setShowSessionModal(true)}
            >
              <span>
                {isPetOfficeFilter
                  ? 'Pet Office'
                  : selectedSession
                  ? `${selectedSession.barangay_name} · ${fmtDate(selectedSession.session_date)}`
                  : 'All records'}
              </span>
              <span className="records-session-caret">▾</span>
            </button>
            {sessionFilter && (
              <button
                type="button"
                className="btn btn-outline records-clear-btn"
                onClick={() => { setSessionFilter(''); setSessionSearch('') }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="records-search-bar">
        <input
          type="search"
          value={petSearch}
          onChange={(e) => setPetSearch(e.target.value)}
          placeholder="Search by pet name or owner…"
          className="encode-input"
        />
      </div>

      {loading ? (
        <p className="records-state">Loading…</p>
      ) : displayRecords.length === 0 ? (
        <p className="records-state">
          {records.length === 0
            ? (sessionFilter ? 'No records for this session.' : 'No vaccination records yet.')
            : `No pets match "${petSearch}".`}
        </p>
      ) : (
        <ul className="records-list">
          {displayRecords.map((r) => (
            <li key={r.vaccine_id} className="records-card">
              <div className="records-card-date">
                <span className="records-date-main">{fmtDate(r.vaccine_date)}</span>
                <span className={`records-tag records-tag--${r.is_office_visit ? 'office' : 'drive'}`}>
                  {r.is_office_visit ? 'Pet Office' : 'Drive'}
                </span>
              </div>

              <div className="records-card-body">
                <div className="records-card-top">
                  <span className="records-card-pet">
                    {r.pet_name}
                    {r.pet_type && (
                      <span className="records-card-pettype">
                        {' '}· {r.pet_type}{r.pet_age ? ` · ${r.pet_age}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="records-card-owner">{r.owner_name ?? '—'}</span>
                </div>
                <p className="records-card-detail">{r.vaccine_details}</p>
                <div className="records-card-meta">
                  <span>Lot {r.manufacturer_no}</span>
                  <span>{r.vet_name ?? '—'}</span>
                  <span className="records-card-code">{r.approval_code ?? '—'}</span>
                </div>
              </div>

              <div className="records-card-actions">
                <button
                  type="button"
                  className="btn btn-outline records-action-btn"
                  onClick={() => setEditTarget(r)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="records-del-btn"
                  onClick={() => setDeleteTarget(r)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editTarget && (
        <div className="modal-backdrop" onClick={() => setEditTarget(null)}>
          <div
            className="modal modal--lg"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3 className="modal-title">
                Edit Record — {editTarget.pet_name}
              </h3>
              <button type="button" className="modal-close-btn" onClick={() => setEditTarget(null)}>
                ×
              </button>
            </div>
            <div className="modal-scroll">
              <RecordEditForm
                record={editTarget}
                vets={vets}
                onSave={(form) => handleUpdate(editTarget.vaccine_id, form)}
                onCancel={() => setEditTarget(null)}
              />
            </div>
          </div>
        </div>
      )}

      {showSessionModal && (
        <div className="modal-backdrop" onClick={() => setShowSessionModal(false)}>
          <div
            className="modal modal--lg"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3 className="modal-title">Select Session</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowSessionModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-search-bar">
              <input
                type="search"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Search by barangay name…"
                className="encode-input"
                autoFocus
              />
              <span className="modal-result-count">
                {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="modal-scroll">
              <div className="session-modal-list">
                <button
                  type="button"
                  className={`session-modal-item${!sessionFilter ? ' is-active' : ''}`}
                  onClick={() => { setSessionFilter(''); setShowSessionModal(false) }}
                >
                  <span className="session-modal-brgy">All records</span>
                  <span className="session-modal-date">no filter</span>
                </button>
                <button
                  type="button"
                  className={`session-modal-item session-modal-item--office${isPetOfficeFilter ? ' is-active' : ''}`}
                  onClick={() => { setSessionFilter('office'); setShowSessionModal(false) }}
                >
                  <span className="session-modal-brgy">Pet Office</span>
                  <span className="session-modal-date">clinic visits only</span>
                </button>
                {filteredSessions.map((s) => (
                  <button
                    key={s.session_id}
                    type="button"
                    className={`session-modal-item${String(s.session_id) === sessionFilter ? ' is-active' : ''}`}
                    onClick={() => { setSessionFilter(String(s.session_id)); setShowSessionModal(false) }}
                  >
                    <span className="session-modal-brgy">
                      {s.barangay_name ?? `Barangay #${s.barangay_id}`}
                    </span>
                    <span className="session-modal-date">{fmtDate(s.session_date)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">Delete Record</h3>
            <p className="modal-body">
              Delete the vaccination for <strong>{deleteTarget.pet_name}</strong> on{' '}
              <strong>{fmtDate(deleteTarget.vaccine_date)}</strong>?
              The associated approval ID will also be removed. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(deleteTarget)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function RecordEditForm({ record, vets, onSave, onCancel }) {
  const [form, setForm] = useState({
    vaccine_date:    String(record.vaccine_date ?? '').slice(0, 10),
    vet_id:          String(record.vet_id ?? ''),
    vaccine_details: record.vaccine_details ?? '',
    manufacturer_no: record.manufacturer_no ?? '',
    is_office_visit: record.is_office_visit ?? false,
  })
  const update = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  return (
    <form
      className="encode-form records-edit-form"
      onSubmit={(e) => { e.preventDefault(); onSave(form) }}
    >
      <label>Date
        <input required type="date" value={form.vaccine_date} onChange={update('vaccine_date')} className="encode-input" />
      </label>
      <label>Veterinarian
        <select required value={form.vet_id} onChange={update('vet_id')} className="encode-input">
          <option value="">— select —</option>
          {vets.map((v) => (
            <option key={v.vet_id} value={v.vet_id}>{v.vet_name}</option>
          ))}
        </select>
      </label>
      <label>Manufacturer / lot #
        <input required value={form.manufacturer_no} onChange={update('manufacturer_no')} className="encode-input" />
      </label>
      <label className="encode-form-wide">Details
        <textarea
          required
          rows={3}
          value={form.vaccine_details}
          onChange={update('vaccine_details')}
          className="encode-input"
        />
      </label>
      <label className="encode-form-wide encode-form-check">
        <input
          type="checkbox"
          checked={form.is_office_visit}
          onChange={(e) => setForm((p) => ({ ...p, is_office_visit: e.target.checked }))}
        />
        Vaccinated at Pet Office
      </label>
      <div className="encode-form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save changes</button>
      </div>
    </form>
  )
}
