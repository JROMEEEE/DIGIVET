import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import './RecordsPage.css'

function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString()
}

function groupByOwnerPet(records) {
  const owners = new Map()
  for (const r of records) {
    const oid = r.owner_id ?? r.owner_name ?? '?'
    if (!owners.has(oid)) {
      owners.set(oid, {
        owner_id:     oid,
        owner_name:   r.owner_name   ?? '—',
        barangay_name: r.barangay_name ?? null,
        pets: new Map(),
      })
    }
    const owner = owners.get(oid)
    const pid = r.pet_id ?? r.pet_name ?? '?'
    if (!owner.pets.has(pid)) {
      owner.pets.set(pid, {
        pet_id: pid, pet_name: r.pet_name ?? '—',
        pet_type: r.pet_type, pet_age: r.pet_age,
        records: [],
      })
    }
    owner.pets.get(pid).records.push(r)
  }
  return [...owners.values()].map((o) => ({ ...o, pets: [...o.pets.values()] }))
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
  const [expandedOwners, setExpandedOwners] = useState(new Set())
  const [expandedPets, setExpandedPets]     = useState(new Set())
  const [viewTarget, setViewTarget]         = useState(null)
  const [editTarget, setEditTarget]         = useState(null)
  const [deleteTarget, setDeleteTarget]     = useState(null)
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

  const grouped    = useMemo(() => groupByOwnerPet(displayRecords), [displayRecords])
  const totalPets  = grouped.reduce((s, o) => s + o.pets.length, 0)

  function toggleOwner(id) {
    setExpandedOwners((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function togglePet(id) {
    setExpandedPets((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

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
          ) : (
            <>
              <span className="records-count-num">{grouped.length}</span>
              <span className="records-count-label">
                owner{grouped.length !== 1 ? 's' : ''} · {totalPets} pet{totalPets !== 1 ? 's' : ''} · {displayRecords.length} record{displayRecords.length !== 1 ? 's' : ''}
                {q ? ` matching "${petSearch}"` : isPetOfficeFilter ? ' — Pet Office' : selectedSession ? ` in ${selectedSession.barangay_name}` : ''}
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
            : `No records match "${petSearch}".`}
        </p>
      ) : (
        <div className="owner-groups">
          {grouped.map((owner) => {
            const ownerOpen = expandedOwners.has(owner.owner_id)
            const ownerRecordCount = owner.pets.reduce((s, p) => s + p.records.length, 0)
            return (
              <div key={owner.owner_id} className="owner-group">
                <button
                  type="button"
                  className={`owner-group-head${ownerOpen ? ' is-open' : ''}`}
                  onClick={() => toggleOwner(owner.owner_id)}
                >
                  <span className="owner-group-avatar">
                    {(owner.owner_name ?? '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="owner-group-name">{owner.owner_name}</span>
                  {owner.barangay_name && (
                    <span className="owner-group-brgy">Brgy. {owner.barangay_name}</span>
                  )}
                  <span className="owner-group-meta">
                    {owner.pets.length} pet{owner.pets.length !== 1 ? 's' : ''} · {ownerRecordCount} record{ownerRecordCount !== 1 ? 's' : ''}
                  </span>
                  <span className="owner-group-chevron" aria-hidden="true">
                    {ownerOpen ? '▲' : '▼'}
                  </span>
                </button>

                {ownerOpen && (
                  <div className="owner-group-body">
                    {owner.pets.map((pet) => {
                      const petOpen = expandedPets.has(pet.pet_id)
                      return (
                        <div key={pet.pet_id} className="pet-group">
                          <button
                            type="button"
                            className={`pet-group-head${petOpen ? ' is-open' : ''}`}
                            onClick={() => togglePet(pet.pet_id)}
                          >
                            <span className="pet-group-icon" aria-hidden="true">
                              {pet.pet_type?.[0]?.toUpperCase() ?? 'P'}
                            </span>
                            <span className="pet-group-name">{pet.pet_name}</span>
                            <span className="pet-group-type">
                              {pet.pet_type}{pet.pet_age ? ` · ${pet.pet_age}` : ''}
                            </span>
                            <span className="pet-group-count">
                              {pet.records.length} record{pet.records.length !== 1 ? 's' : ''}
                            </span>
                            <span className="pet-group-chevron" aria-hidden="true">
                              {petOpen ? '▲' : '▼'}
                            </span>
                          </button>

                          {petOpen && (
                            <ul className="pet-records-list">
                              {pet.records.map((r) => (
                                <li
                                  key={r.vaccine_id}
                                  className="pet-record-row"
                                  onClick={() => setViewTarget(r)}
                                >
                                  <span className="prl-date">{fmtDate(r.vaccine_date)}</span>
                                  <span className={`records-tag records-tag--${r.is_office_visit ? 'office' : 'drive'}`}>
                                    {r.is_office_visit ? 'Office' : 'Drive'}
                                  </span>
                                  <span className="prl-vaccine">{r.vaccine_details}</span>
                                  <span className="prl-vet">{r.vet_name ?? '—'}</span>
                                  <span className="prl-code">{r.approval_code ?? '—'}</span>
                                  <div className="prl-actions" onClick={(e) => e.stopPropagation()}>
                                    <button type="button" className="btn btn-outline records-action-btn" onClick={() => setEditTarget(r)}>Edit</button>
                                    <button type="button" className="records-del-btn" onClick={() => setDeleteTarget(r)}>Delete</button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {viewTarget && (
        <RecordViewModal
          record={viewTarget}
          sessions={sessions}
          onClose={() => setViewTarget(null)}
          onEdit={(r)   => { setViewTarget(null); setEditTarget(r) }}
          onDelete={(r) => { setViewTarget(null); setDeleteTarget(r) }}
        />
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

function RecordViewModal({ record: r, sessions, onClose, onEdit, onDelete }) {
  const session = sessions.find((s) => s.session_id === r.session_id)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal record-view-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Vaccination record detail"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — mirrors hero-card-head */}
        <div className="rvm-head">
          <div className="rvm-head-left">
            <span className="rvm-title">Vaccination Record</span>
            <span className="rvm-id">#{String(r.vaccine_id).padStart(5, '0')}</span>
          </div>
          <div className="rvm-head-right">
            <span className={`records-tag records-tag--${r.is_office_visit ? 'office' : 'drive'}`}>
              {r.is_office_visit ? 'Pet Office' : 'Drive'}
            </span>
            <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Rows — mirrors hero-card-row */}
        <div className="rvm-rows">
          <div className="rvm-row">
            <span className="rvm-label">Pet</span>
            <span className="rvm-value">
              {r.pet_name}
              {r.pet_type && ` · ${r.pet_type}`}
              {r.pet_age  && ` · ${r.pet_age}`}
            </span>
          </div>
          <div className="rvm-row">
            <span className="rvm-label">Owner</span>
            <span className="rvm-value">{r.owner_name ?? '—'}</span>
          </div>
          <div className="rvm-row">
            <span className="rvm-label">Vaccine</span>
            <span className="rvm-value">
              <span className="rvm-tick" aria-hidden="true" />
              {r.vaccine_details}
            </span>
          </div>
          <div className="rvm-row">
            <span className="rvm-label">Approval ID</span>
            <span className="rvm-value rvm-code">{r.approval_code ?? '—'}</span>
          </div>
          <div className="rvm-row">
            <span className="rvm-label">Veterinarian</span>
            <span className="rvm-value">{r.vet_name ?? '—'}</span>
          </div>
          <div className="rvm-row">
            <span className="rvm-label">Lot #</span>
            <span className="rvm-value">{r.manufacturer_no}</span>
          </div>
          <div className="rvm-row">
            <span className="rvm-label">Date</span>
            <span className="rvm-value">{fmtDate(r.vaccine_date)}</span>
          </div>
          {session ? (
            <div className="rvm-row">
              <span className="rvm-label">Session</span>
              <span className="rvm-value">
                {session.barangay_name} · {fmtDate(session.session_date)}
              </span>
            </div>
          ) : r.is_office_visit ? (
            <div className="rvm-row">
              <span className="rvm-label">Session</span>
              <span className="rvm-value" style={{ color: 'var(--text-muted)' }}>Pet Office visit</span>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="rvm-actions">
          <button type="button" className="btn btn-outline rvm-action-btn" onClick={() => onEdit(r)}>
            Edit
          </button>
          <button type="button" className="rvm-delete-btn" onClick={() => onDelete(r)}>
            Delete
          </button>
        </div>
      </div>
    </div>
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
