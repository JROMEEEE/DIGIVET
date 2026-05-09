import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import './VeterinariansPage.css'

const LIMIT = 200

export default function VeterinariansPage() {
  const [vets, setVets] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [viewModal, setViewModal] = useState(null)
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState(null)

  function flashMsg(msg) {
    setFlash(msg)
    setError(null)
    setTimeout(() => setFlash(null), 3500)
  }

  useEffect(() => {
    api.vets.list()
      .then((vs) => setVets(vs.sort((a, b) => a.vet_name.localeCompare(b.vet_name))))
      .catch((err) => setError(err.message))
  }, [])

  async function addVet(vetName) {
    try {
      const created = await api.vets.create({ vet_name: vetName })
      setVets((prev) => [...prev, created].sort((a, b) => a.vet_name.localeCompare(b.vet_name)))
      setShowAddForm(false)
      flashMsg(`Veterinarian "${created.vet_name}" added.`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="vets-page">
      <div className="vets-header">
        <div>
          <h2 className="vets-title">Veterinarians</h2>
          <p className="vets-sub">Manage registered veterinarians. Approval IDs are generated via the Encode module.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowAddForm((v) => !v)}
        >
          {showAddForm ? 'Cancel' : '+ Add veterinarian'}
        </button>
      </div>

      {error && <div className="encode-banner encode-banner--error">{error}</div>}
      {flash && <div className="encode-banner encode-banner--ok">{flash}</div>}

      {showAddForm && (
        <AddVetForm onSubmit={addVet} onCancel={() => setShowAddForm(false)} />
      )}

      {vets.length === 0 && !showAddForm ? (
        <div className="vets-empty">
          <p>No veterinarians registered yet.</p>
        </div>
      ) : (
        <ul className="vets-list">
          {vets.map((vet) => (
            <li key={vet.vet_id} className="vets-item">
              <div className="vets-item-row">
                <div className="vets-avatar">{vet.vet_name.charAt(0).toUpperCase()}</div>
                <div className="vets-item-info">
                  <span className="vets-item-name">{vet.vet_name}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setViewModal(vet)}
                >
                  View approval IDs
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewModal && (
        <ApprovalsModal vet={viewModal} onClose={() => setViewModal(null)} />
      )}
    </main>
  )
}

function ApprovalsModal({ vet, onClose }) {
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const tokenRef = useRef(0)

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    const token = ++tokenRef.current
    setLoading(true)
    const delay = search ? 300 : 0
    const id = setTimeout(() => {
      api.approvals
        .list({ vet_id: vet.vet_id, q: search || undefined, limit: LIMIT })
        .then((data) => {
          if (token !== tokenRef.current) return
          setRows(data)
          setLoading(false)
        })
        .catch(() => {
          if (token !== tokenRef.current) return
          setLoading(false)
        })
    }, delay)
    return () => clearTimeout(id)
  }, [vet.vet_id, search])

  const capped = rows.length >= LIMIT

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--lg"
        role="dialog"
        aria-modal="true"
        aria-label={`Approval IDs for ${vet.vet_name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="modal-title">Approval IDs — {vet.vet_name}</h3>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-search-bar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, pet name, or owner…"
            className="encode-input"
            autoFocus
          />
          <span className={`modal-result-count${capped ? ' is-capped' : ''}`}>
            {loading
              ? '…'
              : capped
              ? `${LIMIT}+ results — refine search`
              : `${rows.length} result${rows.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="modal-scroll">
          {loading ? (
            <p className="modal-state">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="modal-state">
              {search ? 'No records match your search.' : 'No approval IDs yet — record a vaccination in the Encode module.'}
            </p>
          ) : (
            <>
              <div className="modal-col-head modal-col-head--4">
                <span>Approval Code</span>
                <span>Pet</span>
                <span>Owner</span>
                <span>Barangay</span>
              </div>
              <ul className="vets-approvals-list">
                {rows.map((a, i) => (
                  <li key={a.approval_id ?? i} className="vets-approval-row vets-approval-row--4">
                    <span className="vets-approval-code">{a.approval_code}</span>
                    <span className="vets-approval-pet">{a.pet_name ?? '—'}</span>
                    <span className="vets-approval-owner">{a.owner_name ?? '—'}</span>
                    <span className="vets-approval-brgy">
                      {a.barangay_name ?? '—'}
                      {a.is_office_visit && <span className="vets-approval-office-tag"> · Office</span>}
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

function AddVetForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('')
  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(name.trim())
  }
  return (
    <form className="vets-add-form" onSubmit={submit}>
      <label className="vets-add-label">
        Veterinarian name
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dr. Full Name"
          className="encode-input"
        />
      </label>
      <div className="vets-add-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Add veterinarian</button>
      </div>
    </form>
  )
}
