import { useEffect, useState } from 'react'
import { useAuth } from '../../../shared/AuthContext'
import { api } from '../../api'
import './UserPortal.css'

function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString()
}

export default function UserPortal() {
  const { user, logout } = useAuth()
  const [pets, setPets]             = useState([])
  const [expandedPet, setExpandedPet] = useState(null)
  const [vaccinations, setVaccinations] = useState({}) // { pet_id: [...records] }
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  useEffect(() => {
    if (!user?.owner_id) { setLoading(false); return }
    api.pets.list({ owner_id: user.owner_id })
      .then((data) => { setPets(data); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [user?.owner_id])

  async function togglePet(pet) {
    const id = pet.pet_id
    if (expandedPet === id) { setExpandedPet(null); return }
    setExpandedPet(id)
    if (vaccinations[id]) return // already loaded
    try {
      const records = await api.vaccinations.list(id)
      setVaccinations((prev) => ({ ...prev, [id]: records }))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="portal">
      <header className="portal-header">
        <div className="portal-brand">
          <span className="portal-brand-mark">DV</span>
          <div>
            <span className="portal-brand-name">DIGIVET</span>
            <span className="portal-brand-sub">Pet Owner Portal</span>
          </div>
        </div>
        <div className="portal-user">
          <span className="portal-user-name">{user?.display_name}</span>
          <button type="button" className="portal-logout-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="portal-main">
        <div className="portal-welcome">
          <h2>Welcome, {user?.display_name}</h2>
          <p>View your pets and their vaccination records below.</p>
        </div>

        {error && (
          <div className="portal-error">{error}</div>
        )}

        {loading ? (
          <p className="portal-state">Loading your records…</p>
        ) : !user?.owner_id ? (
          <div className="portal-unlinked">
            <span className="portal-unlinked-icon" aria-hidden="true">⚠</span>
            <div>
              <strong>Account not yet linked</strong>
              <p>
                Your account has not been linked to a pet owner record.
                Please contact the Lipa City Veterinary Office to link your account.
              </p>
            </div>
          </div>
        ) : pets.length === 0 ? (
          <p className="portal-state">No pets registered under your account.</p>
        ) : (
          <ul className="portal-pets">
            {pets.map((pet) => {
              const isOpen = expandedPet === pet.pet_id
              const records = vaccinations[pet.pet_id]

              return (
                <li key={pet.pet_id} className="portal-pet">
                  <button
                    type="button"
                    className={`portal-pet-head${isOpen ? ' is-open' : ''}`}
                    onClick={() => togglePet(pet)}
                  >
                    <span className="portal-pet-avatar">
                      {pet.pet_type?.[0]?.toUpperCase() ?? 'P'}
                    </span>
                    <span className="portal-pet-info">
                      <span className="portal-pet-name">{pet.pet_name}</span>
                      <span className="portal-pet-sub">
                        {pet.pet_type} · {pet.pet_age} · {pet.pet_color}
                      </span>
                    </span>
                    <span className="portal-pet-chevron" aria-hidden="true">
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="portal-vax">
                      {!records ? (
                        <p className="portal-state">Loading…</p>
                      ) : records.length === 0 ? (
                        <p className="portal-state portal-state--sm">
                          No vaccination records yet.
                        </p>
                      ) : (
                        <table className="portal-vax-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Vaccine</th>
                              <th>Veterinarian</th>
                              <th>Approval Code</th>
                              <th>Location</th>
                            </tr>
                          </thead>
                          <tbody>
                            {records.map((r) => (
                              <tr key={r.vaccine_id}>
                                <td>{fmtDate(r.vaccine_date)}</td>
                                <td>{r.vaccine_details}</td>
                                <td>{r.vet_name ?? '—'}</td>
                                <td>
                                  <span className="portal-code">
                                    {r.approval_code ?? '—'}
                                  </span>
                                </td>
                                <td>
                                  <span className={`portal-tag portal-tag--${r.is_office_visit ? 'office' : 'drive'}`}>
                                    {r.is_office_visit ? 'Pet Office' : 'Barangay Drive'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
