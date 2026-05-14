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
  const navigate  = useNavigate()
  const [activeTab, setActiveTab] = useState('records') // 'records' | 'registry'
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
  const [showOwnersModal, setShowOwnersModal] = useState(false)
  const [showPetsModal, setShowPetsModal]     = useState(false)
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

      {/* ── Page header ───────────────────────────────────────── */}
      <div className="records-header">
        <div>
          <h1 className="records-title">Records</h1>
          <p className="records-sub">Vaccination records grouped by owner and pet.</p>
        </div>
        <div className="records-header-actions">
          <button type="button" className="btn btn-outline" onClick={() => setShowOwnersModal(true)}>
            Manage Owners
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setShowPetsModal(true)}>
            Manage Pets
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard/encode')}>
            + New record
          </button>
        </div>
      </div>

      {error && <div className="encode-banner encode-banner--error">{error}</div>}
      {flash && <div className="encode-banner encode-banner--ok">{flash}</div>}

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div className="records-tabs">
        <button type="button" className={`records-tab${activeTab === 'records' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('records')}>💉 Vaccination Records</button>
        <button type="button" className={`records-tab${activeTab === 'registry' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('registry')}>👥 Owner Registry</button>
      </div>

      {activeTab === 'registry' && <RegistryView />}

      {activeTab === 'records' && <>

      {/* ── Unified controls bar ──────────────────────────────── */}
      <div className="records-controls">
        <input
          type="search"
          value={petSearch}
          onChange={(e) => setPetSearch(e.target.value)}
          placeholder="Search by pet name or owner…"
          className="encode-input records-search"
        />
        <button
          type="button"
          className={`records-session-btn${sessionFilter ? ' has-value' : ''}`}
          onClick={() => setShowSessionModal(true)}
        >
          <span className="records-session-icon">🗂</span>
          <span>
            {isPetOfficeFilter
              ? 'Pet Office'
              : selectedSession
              ? `${selectedSession.barangay_name} · ${fmtDate(selectedSession.session_date)}`
              : 'All sessions'}
          </span>
          <span className="records-session-caret">▾</span>
        </button>
        {sessionFilter && (
          <button type="button" className="btn btn-outline records-clear-btn"
            onClick={() => { setSessionFilter(''); setSessionSearch('') }}>
            ✕ Clear
          </button>
        )}
        {!loading && (
          <span className="records-summary-pill">
            {grouped.length} owner{grouped.length !== 1 ? 's' : ''} · {totalPets} pet{totalPets !== 1 ? 's' : ''} · {displayRecords.length} record{displayRecords.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {capped && (
        <p className="records-capped">Showing first 500 records — filter by session to see all.</p>
      )}

      {loading ? (
        <div className="records-state-box">
          <span className="records-spinner" />
          <span>Loading records…</span>
        </div>
      ) : displayRecords.length === 0 ? (
        <div className="records-state-box">
          <span className="records-empty-icon">📋</span>
          <span className="records-empty-title">
            {records.length === 0
              ? (sessionFilter ? 'No records for this session.' : 'No vaccination records yet.')
              : `No records match "${petSearch}".`}
          </span>
        </div>
      ) : (
        <div className="owner-groups">
          {grouped.map((owner) => {
            const ownerOpen = expandedOwners.has(owner.owner_id)
            const ownerRecordCount = owner.pets.reduce((s, p) => s + p.records.length, 0)
            return (
              <div key={owner.owner_id} className={`owner-group${ownerOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="owner-group-head"
                  onClick={() => toggleOwner(owner.owner_id)}
                >
                  <span className="owner-group-avatar">
                    {(owner.owner_name ?? '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="owner-group-info">
                    <span className="owner-group-name">{owner.owner_name}</span>
                    {owner.barangay_name && (
                      <span className="owner-group-brgy">📍 {owner.barangay_name}</span>
                    )}
                  </div>
                  <div className="owner-group-badges">
                    <span className="owner-badge">{owner.pets.length} pet{owner.pets.length !== 1 ? 's' : ''}</span>
                    <span className="owner-badge owner-badge--records">{ownerRecordCount} record{ownerRecordCount !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="owner-group-chevron" aria-hidden="true">
                    {ownerOpen ? '▲' : '▼'}
                  </span>
                </button>

                {ownerOpen && (
                  <div className="owner-group-body">
                    {owner.pets.map((pet) => {
                      const petOpen = expandedPets.has(pet.pet_id)
                      return (
                        <div key={pet.pet_id} className={`pet-group${petOpen ? ' is-open' : ''}`}>
                          <button
                            type="button"
                            className="pet-group-head"
                            onClick={() => togglePet(pet.pet_id)}
                          >
                            <span className="pet-group-icon">🐾</span>
                            <div className="pet-group-info">
                              <span className="pet-group-name">{pet.pet_name}</span>
                              <span className="pet-group-type">
                                {pet.pet_type}{pet.pet_age ? ` · ${pet.pet_age}` : ''}
                              </span>
                            </div>
                            <span className="pet-badge">
                              {pet.records.length} record{pet.records.length !== 1 ? 's' : ''}
                            </span>
                            <span className="pet-group-chevron">{petOpen ? '▲' : '▼'}</span>
                          </button>

                          {petOpen && (
                            <div className="pet-records-list">
                              <div className="prl-head">
                                <span>Date</span><span>Type</span><span>Vaccine</span>
                                <span>Veterinarian</span><span>Code</span><span></span>
                              </div>
                              {pet.records.map((r) => (
                                <div
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
                                    <button type="button" className="prl-btn-edit" onClick={() => setEditTarget(r)}>Edit</button>
                                    <button type="button" className="prl-btn-del" onClick={() => setDeleteTarget(r)}>✕</button>
                                  </div>
                                </div>
                              ))}
                            </div>
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
      </>}

      {showOwnersModal && (
        <OwnersManageModal onClose={() => setShowOwnersModal(false)} />
      )}
      {showPetsModal && (
        <PetsManageModal onClose={() => setShowPetsModal(false)} />
      )}
    </main>
  )
}

/* ── Owner Registry (all owners, vaccinated or not) ─────────── */
function RegistryView() {
  const [owners, setOwners]           = useState([])
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(true)
  const [expandedOwners, setExpandedOwners] = useState(new Set())
  const [ownerPets, setOwnerPets]     = useState({})   // owner_id → pets[]
  const [expandedPets, setExpandedPets]     = useState(new Set())
  const [petVax, setPetVax]           = useState({})   // pet_id → vaccinations[]
  const [loadingPets, setLoadingPets] = useState(new Set())
  const [loadingVax, setLoadingVax]   = useState(new Set())

  useEffect(() => {
    api.owners.search('', 500)
      .then((os) => { setOwners(os); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? owners.filter((o) =>
        o.owner_name?.toLowerCase().includes(q) ||
        o.contact_number?.includes(q) ||
        o.barangay_name?.toLowerCase().includes(q))
    : owners

  async function toggleOwner(owner) {
    const id = owner.owner_id
    setExpandedOwners((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (!ownerPets[id]) {
      setLoadingPets((prev) => new Set(prev).add(id))
      try {
        const pets = await api.pets.list({ owner_id: id })
        setOwnerPets((prev) => ({ ...prev, [id]: pets }))
      } catch {}
      setLoadingPets((prev) => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  async function togglePet(pet) {
    const id = pet.pet_id
    setExpandedPets((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    if (!petVax[id]) {
      setLoadingVax((prev) => new Set(prev).add(id))
      try {
        const vax = await api.vaccinations.list(id)
        setPetVax((prev) => ({ ...prev, [id]: vax }))
      } catch {}
      setLoadingVax((prev) => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  return (
    <div className="registry">
      <div className="records-controls">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by owner name, contact, or barangay…"
          className="encode-input records-search" />
        <span className="records-summary-pill">
          {loading ? '…' : `${filtered.length} owner${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading ? (
        <div className="records-state-box"><span className="records-spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="records-state-box"><span className="records-empty-icon">👥</span><span className="records-empty-title">No owners found.</span></div>
      ) : (
        <div className="owner-groups">
          {filtered.map((owner) => {
            const isOpen = expandedOwners.has(owner.owner_id)
            const pets   = ownerPets[owner.owner_id] ?? []
            const isLoadingPets = loadingPets.has(owner.owner_id)

            return (
              <div key={owner.owner_id} className="owner-group">
                <button type="button"
                  className={`owner-group-head${isOpen ? ' is-open' : ''}`}
                  onClick={() => toggleOwner(owner)}>
                  <div className="owner-group-avatar">
                    {owner.owner_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="owner-group-name">{owner.owner_name}</span>
                  {owner.barangay_name && (
                    <span className="owner-group-brgy">Brgy. {owner.barangay_name}</span>
                  )}
                  <span className="owner-group-meta">{owner.contact_number}</span>
                  <span className="owner-group-chevron">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="owner-group-body">
                    {isLoadingPets ? (
                      <p className="registry-hint">Loading pets…</p>
                    ) : pets.length === 0 ? (
                      <p className="registry-hint">No pets registered.</p>
                    ) : (
                      pets.map((pet) => {
                        const petOpen = expandedPets.has(pet.pet_id)
                        const vax     = petVax[pet.pet_id] ?? []
                        const isLoadingVax = loadingVax.has(pet.pet_id)

                        return (
                          <div key={pet.pet_id} className="pet-group">
                            <button type="button"
                              className={`pet-group-head${petOpen ? ' is-open' : ''}`}
                              onClick={() => togglePet(pet)}>
                              <span className="pet-group-icon">
                                {pet.pet_type?.[0]?.toUpperCase() ?? 'P'}
                              </span>
                              <span className="pet-group-name">{pet.pet_name}</span>
                              <span className="pet-group-type">
                                {pet.pet_type} · {pet.pet_age}
                              </span>
                              {petVax[pet.pet_id] !== undefined ? (
                                <span className={`registry-vax-badge${vax.length > 0 ? ' registry-vax-badge--ok' : ' registry-vax-badge--none'}`}>
                                  {vax.length > 0 ? `✓ ${vax.length} vaccination${vax.length !== 1 ? 's' : ''}` : '✗ Not vaccinated'}
                                </span>
                              ) : (
                                <span className="pet-group-count">View records</span>
                              )}
                              <span className="pet-group-chevron">{petOpen ? '▲' : '▼'}</span>
                            </button>

                            {petOpen && (
                              <div className="registry-vax-list">
                                {isLoadingVax ? (
                                  <p className="registry-hint">Loading…</p>
                                ) : vax.length === 0 ? (
                                  <p className="registry-hint registry-hint--none">
                                    No vaccinations recorded for {pet.pet_name} yet.
                                  </p>
                                ) : (
                                  <ul className="encode-recent">
                                    {vax.map((r) => (
                                      <li key={r.vaccine_id}>
                                        <span className="encode-recent-date">
                                          {fmtDate(r.vaccine_date)}
                                        </span>
                                        <span className="encode-recent-main">{r.vaccine_details}</span>
                                        <span className="encode-recent-sub">
                                          Lot {r.manufacturer_no} · {r.vet_name ?? '—'} · {r.approval_code ?? '—'}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Owners management modal ─────────────────────────────────── */
function OwnersManageModal({ onClose }) {
  const [barangays, setBarangays] = useState([])
  const [owners, setOwners]       = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [editTarget, setEditTarget]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState(null)

  function ok(m)  { setFlash(m); setError(null); setTimeout(() => setFlash(null), 3000) }
  function err(m) { setError(m); setFlash(null) }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !editTarget && !deleteTarget) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, editTarget, deleteTarget])

  useEffect(() => {
    Promise.all([api.barangays.list(), api.owners.search('', 200)])
      .then(([bs, os]) => { setBarangays(bs); setOwners(os); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = q ? owners.filter(o => o.owner_name?.toLowerCase().includes(q) || o.contact_number?.includes(q)) : owners

  async function save(form, id) {
    try {
      if (id) {
        const u = await api.owners.update(id, form)
        setOwners(prev => prev.map(o => o.owner_id === id
          ? { ...o, ...u, barangay_name: barangays.find(b => b.barangay_id === Number(form.barangay_id))?.barangay_name }
          : o))
        ok('Owner updated.')
      } else {
        const c = await api.owners.create(form)
        setOwners(prev => [{ ...c, barangay_name: barangays.find(b => b.barangay_id === c.barangay_id)?.barangay_name }, ...prev])
        ok('Owner added.')
      }
      setEditTarget(null)
    } catch (e) { err(e.detail ?? e.message) }
  }

  async function remove(owner) {
    try {
      await api.owners.remove(owner.owner_id)
      setOwners(prev => prev.filter(o => o.owner_id !== owner.owner_id))
      setDeleteTarget(null)
      ok('Owner and all related pets/records deleted.')
    } catch (e) { err(e.detail ?? e.message) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">Manage Pet Owners</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-search-bar">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or contact…" className="encode-input" autoFocus />
          <span className="modal-result-count">{filtered.length} owner{filtered.length !== 1 ? 's' : ''}</span>
          <button type="button" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            onClick={() => setEditTarget('new')}>+ Add</button>
        </div>
        <div className="modal-scroll">
          {flash && <div className="encode-banner encode-banner--ok" style={{ margin: '0 0 8px' }}>{flash}</div>}
          {error && <div className="encode-banner encode-banner--error" style={{ margin: '0 0 8px' }}>{error}</div>}
          {loading ? <p className="modal-state">Loading…</p> : filtered.length === 0 ? <p className="modal-state">No owners found.</p> : (
            <div className="manage-table">
              <div className="manage-col-head"><span>Name</span><span>Contact</span><span>Barangay</span><span></span></div>
              {filtered.map(o => (
                <div key={o.owner_id} className="manage-row">
                  <span className="manage-cell-main">{o.owner_name}</span>
                  <span className="manage-cell-muted">{o.contact_number}</span>
                  <span className="manage-cell-muted">{o.barangay_name ?? '—'}</span>
                  <div className="manage-actions">
                    <button type="button" className="btn btn-outline manage-btn" onClick={() => setEditTarget(o)}>Edit</button>
                    <button type="button" className="manage-del-btn" onClick={() => setDeleteTarget(o)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {editTarget && (
        <OwnerFormModal owner={editTarget === 'new' ? null : editTarget} barangays={barangays}
          onSave={save} onCancel={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Delete Owner</h3>
            <p className="modal-body">
              Delete <strong>{deleteTarget.owner_name}</strong>?
              This will also delete all their pets and vaccination records. Cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => remove(deleteTarget)}>Delete all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerFormModal({ owner, barangays, onSave, onCancel }) {
  const [form, setForm] = useState({
    owner_name: owner?.owner_name ?? '',
    contact_number: owner?.contact_number ?? '',
    email: owner?.email ?? '',
    barangay_id: String(owner?.barangay_id ?? ''),
  })
  const u = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{owner ? 'Edit Owner' : 'Add Owner'}</h3>
        <form className="encode-form" style={{ marginTop: 12 }} onSubmit={e => { e.preventDefault(); onSave(form, owner?.owner_id) }}>
          <label>Full name<input required value={form.owner_name} onChange={u('owner_name')} className="encode-input" autoFocus /></label>
          <label>
            <span>Contact <span className="encode-label-hint">(optional)</span></span>
            <input value={form.contact_number} onChange={u('contact_number')} className="encode-input" />
          </label>
          <label className="encode-form-wide">
            <span>Email <span className="encode-label-hint">(optional — enables online account)</span></span>
            <input type="email" value={form.email} onChange={u('email')} className="encode-input" placeholder="owner@example.com" />
          </label>
          <label className="encode-form-wide">Barangay
            <select required value={form.barangay_id} onChange={u('barangay_id')} className="encode-input">
              <option value="">— select —</option>
              {barangays.map(b => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
            </select>
          </label>
          <div className="encode-form-actions">
            <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary">{owner ? 'Save' : 'Add owner'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Pets management modal ───────────────────────────────────── */
function PetsManageModal({ onClose }) {
  const [owners, setOwners] = useState([])
  const [pets, setPets]     = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState(null)

  function ok(m)  { setFlash(m); setError(null); setTimeout(() => setFlash(null), 3000) }
  function err(m) { setError(m); setFlash(null) }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !editTarget && !deleteTarget) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, editTarget, deleteTarget])

  useEffect(() => {
    Promise.all([api.pets.list(), api.owners.search('', 200)])
      .then(([ps, os]) => { setPets(ps); setOwners(os); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = q ? pets.filter(p => p.pet_name?.toLowerCase().includes(q) || p.owner_name?.toLowerCase().includes(q)) : pets

  async function save(form, id) {
    try {
      if (id) {
        const u = await api.pets.update(id, form)
        setPets(prev => prev.map(p => p.pet_id === id
          ? { ...p, ...u, owner_name: owners.find(o => o.owner_id === Number(form.owner_id))?.owner_name }
          : p))
        ok('Pet updated.')
      } else {
        const c = await api.pets.create(form)
        setPets(prev => [{ ...c, owner_name: owners.find(o => o.owner_id === c.owner_id)?.owner_name }, ...prev])
        ok('Pet added.')
      }
      setEditTarget(null)
    } catch (e) { err(e.detail ?? e.message) }
  }

  async function remove(pet) {
    try {
      await api.pets.remove(pet.pet_id)
      setPets(prev => prev.filter(p => p.pet_id !== pet.pet_id))
      setDeleteTarget(null)
      ok('Pet deleted.')
    } catch (e) { err(e.detail ?? e.message) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--lg" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">Manage Pets</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-search-bar">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by pet name or owner…" className="encode-input" autoFocus />
          <span className="modal-result-count">{filtered.length} pet{filtered.length !== 1 ? 's' : ''}</span>
          <button type="button" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            onClick={() => setEditTarget('new')}>+ Add</button>
        </div>
        <div className="modal-scroll">
          {flash && <div className="encode-banner encode-banner--ok" style={{ margin: '0 0 8px' }}>{flash}</div>}
          {error && <div className="encode-banner encode-banner--error" style={{ margin: '0 0 8px' }}>{error}</div>}
          {loading ? <p className="modal-state">Loading…</p> : filtered.length === 0 ? <p className="modal-state">No pets found.</p> : (
            <div className="manage-table">
              <div className="manage-col-head manage-col-head--pets"><span>Pet</span><span>Type · Age</span><span>Owner</span><span></span></div>
              {filtered.map(p => (
                <div key={p.pet_id} className="manage-row manage-row--pets">
                  <span className="manage-cell-main">{p.pet_name}</span>
                  <span className="manage-cell-muted">{p.pet_type} · {p.pet_age}</span>
                  <span className="manage-cell-muted">{p.owner_name ?? '—'}</span>
                  <div className="manage-actions">
                    <button type="button" className="btn btn-outline manage-btn" onClick={() => setEditTarget(p)}>Edit</button>
                    <button type="button" className="manage-del-btn" onClick={() => setDeleteTarget(p)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {editTarget && (
        <PetFormModal pet={editTarget === 'new' ? null : editTarget} owners={owners}
          onSave={save} onCancel={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Delete Pet</h3>
            <p className="modal-body">Delete <strong>{deleteTarget.pet_name}</strong>? Cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => remove(deleteTarget)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PetFormModal({ pet, owners, onSave, onCancel }) {
  const [form, setForm] = useState({ owner_id: String(pet?.owner_id ?? ''), pet_name: pet?.pet_name ?? '', pet_type: pet?.pet_type ?? '', pet_age: pet?.pet_age ?? '', pet_color: pet?.pet_color ?? '' })
  const u = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{pet ? 'Edit Pet' : 'Add Pet'}</h3>
        <form className="encode-form" style={{ marginTop: 12 }} onSubmit={e => { e.preventDefault(); onSave(form, pet?.pet_id) }}>
          <label>Owner
            <select required value={form.owner_id} onChange={u('owner_id')} className="encode-input">
              <option value="">— select —</option>
              {owners.map(o => <option key={o.owner_id} value={o.owner_id}>{o.owner_name}</option>)}
            </select>
          </label>
          <label>Name<input required value={form.pet_name} onChange={u('pet_name')} className="encode-input" autoFocus /></label>
          <label>Type<input required placeholder="Dog / Cat / …" value={form.pet_type} onChange={u('pet_type')} className="encode-input" /></label>
          <label>Age<input required placeholder="e.g. 3 yrs" value={form.pet_age} onChange={u('pet_age')} className="encode-input" /></label>
          <label>Color<input required value={form.pet_color} onChange={u('pet_color')} className="encode-input" /></label>
          <div className="encode-form-actions">
            <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary">{pet ? 'Save' : 'Add pet'}</button>
          </div>
        </form>
      </div>
    </div>
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
