import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import './EncodePage.css'

const todayIso = () => new Date().toISOString().slice(0, 10)

// Handles both "YYYY-MM-DD" and full ISO timestamp strings from the server
function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  return new Date(s.includes('T') ? s : s + 'T00:00:00').toLocaleDateString()
}

function groupByOwner(pets) {
  const map = new Map()
  for (const p of pets) {
    if (!map.has(p.owner_id)) {
      map.set(p.owner_id, {
        owner_id: p.owner_id,
        owner_name: p.owner_name,
        contact_number: p.contact_number,
        pets: [],
      })
    }
    map.get(p.owner_id).pets.push(p)
  }
  return [...map.values()]
}

export default function EncodePage() {
  const [barangays, setBarangays] = useState([])
  const [vets, setVets] = useState([])

  // Mode: null | 'office' | 'drive'
  const [mode, setMode] = useState(null)
  // Active drive session
  const [session, setSession] = useState(null)

  // Drive mode — pet list for the session's barangay
  const [drivePets, setDrivePets]   = useState([])
  const [driveFilter, setDriveFilter] = useState('')

  // Office mode — owner step
  const [ownerMode, setOwnerMode]       = useState(null)
  const [ownerQuery, setOwnerQuery]     = useState('')
  const [ownerResults, setOwnerResults] = useState([])
  const [ownerSearching, setOwnerSearching] = useState(false)

  // Shared — pet + vaccination steps
  const [selectedOwner, setSelectedOwner] = useState(null)
  const [pets, setPets]                   = useState([])
  const [showPetForm, setShowPetForm]     = useState(false)
  const [selectedPet, setSelectedPet]     = useState(null)
  const [recent, setRecent]               = useState([])
  const [showVetForm, setShowVetForm]     = useState(false)
  // Incrementing this key remounts VaccinationForm (clears its internal state)
  const [vaccinationKey, setVaccinationKey] = useState(0)

  const [flash, setFlash] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api.barangays.list(), api.vets.list()])
      .then(([bs, vs]) => { setBarangays(bs); setVets(vs) })
      .catch((err) => setError(err.message))
  }, [])

  // Load barangay pets when drive session is set
  useEffect(() => {
    if (!session) { setDrivePets([]); return }
    api.pets.list({ barangay_id: session.barangay_id })
      .then(setDrivePets)
      .catch((e) => setError(e.message))
  }, [session])

  // Office mode: load pets for selected owner
  useEffect(() => {
    if (mode !== 'office') return
    if (!selectedOwner) { setPets([]); setSelectedPet(null); return }
    api.pets.list({ owner_id: selectedOwner.owner_id }).then(setPets).catch((e) => setError(e.message))
  }, [mode, selectedOwner])

  // Office mode: load recent vaccinations for selected pet
  useEffect(() => {
    if (mode !== 'office' || !selectedPet) { setRecent([]); return }
    api.vaccinations.list(selectedPet.pet_id).then(setRecent).catch((e) => setError(e.message))
  }, [mode, selectedPet])

  // Office mode: debounced owner search
  const searchToken = useRef(0)
  useEffect(() => {
    if (mode !== 'office' || ownerMode !== 'existing') return
    const myToken = ++searchToken.current
    const controller = new AbortController()
    setOwnerSearching(true)
    const id = setTimeout(() => {
      api.owners.search(ownerQuery, 20, controller.signal)
        .then((rows) => {
          if (myToken === searchToken.current) { setOwnerResults(rows); setOwnerSearching(false) }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return
          setError(err.message); setOwnerSearching(false)
        })
    }, 250)
    return () => { clearTimeout(id); controller.abort() }
  }, [mode, ownerMode, ownerQuery])

  function flashMessage(msg) {
    setFlash(msg); setError(null)
    setTimeout(() => setFlash(null), 4000)
  }

  function resetOwnerStep() {
    setOwnerMode(null); setOwnerQuery(''); setOwnerResults([])
    setSelectedOwner(null); setSelectedPet(null); setShowPetForm(false)
    setVaccinationKey(k => k + 1)
  }

  function selectPet(p) {
    setSelectedPet(p)
    setShowPetForm(false)
    setVaccinationKey(k => k + 1)
  }

  function changeSession() {
    setSession(null)
    setDrivePets([])
    setSelectedPet(null)
    setSelectedOwner(null)
    setDriveFilter('')
  }

  function changeMode() {
    setMode(null); setSession(null)
    setDrivePets([]); setDriveFilter('')
    setSelectedPet(null); setSelectedOwner(null)
    resetOwnerStep()
  }

  async function createOwner(form) {
    try {
      const created = await api.owners.create({
        owner_name: form.owner_name,
        contact_number: form.contact_number || '',
        barangay_id: Number(form.barangay_id),
        email: form.email || undefined,
      })
      const enriched = {
        ...created,
        barangay_name: barangays.find((b) => b.barangay_id === created.barangay_id)?.barangay_name,
      }
      setSelectedOwner(enriched)
      flashMessage(`Owner "${enriched.owner_name}" added.`)
    } catch (err) { setError(err.message) }
  }

  async function createPet(form, ownerOverride) {
    const owner = ownerOverride ?? selectedOwner
    try {
      const created = await api.pets.create({
        owner_id: owner.owner_id,
        pet_name: form.pet_name, pet_type: form.pet_type,
        pet_age: form.pet_age, pet_color: form.pet_color,
      })
      const enriched = { ...created, owner_name: owner.owner_name, contact_number: owner.contact_number }
      if (mode === 'office') {
        setPets((prev) => [...prev, enriched])
        setSelectedPet(enriched)
        setShowPetForm(false)
      } else {
        // Drive mode: add to list; DrivePetList manages its own form state
        setDrivePets((prev) => [...prev, enriched])
      }
      flashMessage(`Pet "${enriched.pet_name}" added.`)
    } catch (err) { setError(err.message) }
  }

  async function addNewDriveRegistration(ownerForm, petForm) {
    try {
      const owner = await api.owners.create({
        owner_name: ownerForm.owner_name,
        contact_number: ownerForm.contact_number || '',
        barangay_id: session.barangay_id,
        email: ownerForm.email || undefined,
      })
      const pet = await api.pets.create({
        owner_id: owner.owner_id,
        pet_name: petForm.pet_name, pet_type: petForm.pet_type,
        pet_age: petForm.pet_age, pet_color: petForm.pet_color,
      })
      setDrivePets((prev) => [...prev, { ...pet, owner_name: owner.owner_name, contact_number: owner.contact_number }])
      flashMessage(`Registered ${owner.owner_name} with pet "${pet.pet_name}".`)
    } catch (err) { setError(err.message) }
  }

  async function createVet(form, onCreated) {
    try {
      const created = await api.vets.create({ vet_name: form.vet_name })
      setVets((prev) => [...prev, created].sort((a, b) => a.vet_name.localeCompare(b.vet_name)))
      setShowVetForm(false)
      flashMessage(`Veterinarian "${created.vet_name}" added.`)
      onCreated?.(created)
    } catch (err) { setError(err.message) }
  }

  async function recordVaccination(form) {
    try {
      const created = await api.vaccinations.create({
        pet_id: selectedPet.pet_id,
        vet_id: Number(form.vet_id),
        vaccine_date: form.vaccine_date,
        vaccine_details: form.vaccine_details,
        manufacturer_no: form.manufacturer_no,
        session_id: mode === 'drive' ? session?.session_id : null,
        is_office_visit: mode === 'office' ? true : Boolean(form.is_office_visit),
      })
      flashMessage(`Vaccination recorded · approval ${created.approval_code}`)
      if (mode === 'drive') {
        setSelectedPet(null)
        setSelectedOwner(null)
      } else {
        const list = await api.vaccinations.list(selectedPet.pet_id)
        setRecent(list)
        setVaccinationKey(k => k + 1)
      }
    } catch (err) { setError(err.message) }
  }

  // ── Render ───────────────────────────────────────────────
  if (!mode) {
    return (
      <ModePicker
        onSelect={setMode}
        flash={flash} error={error}
      />
    )
  }

  if (mode === 'drive' && !session) {
    return (
      <DriveSetup
        barangays={barangays}
        onSelect={setSession}
        onBack={changeMode}
        flash={flash}
        error={error}
      />
    )
  }

  return (
    <main className="encode" aria-label="Encoding workflow">
      <SessionBanner mode={mode} session={session} onChangeSession={changeSession} onChangeMode={changeMode} />

      {error && <div className="encode-banner encode-banner--error">{error}</div>}
      {flash && <div className="encode-banner encode-banner--ok">{flash}</div>}

      {mode === 'drive' ? (
        selectedPet ? (
          <DriveRecord
            pet={selectedPet}
            vets={vets}
            showVetForm={showVetForm}
            onToggleVetForm={() => setShowVetForm((v) => !v)}
            onCreateVet={createVet}
            onSubmit={recordVaccination}
            onBack={() => { setSelectedPet(null); setSelectedOwner(null) }}
          />
        ) : (
          <DrivePetList
            pets={drivePets}
            filter={driveFilter}
            onFilterChange={setDriveFilter}
            onSelectPet={(p) => {
              setSelectedPet(p)
              setSelectedOwner({ owner_id: p.owner_id, owner_name: p.owner_name, contact_number: p.contact_number })
            }}
            onCreatePet={createPet}
            onNewRegistration={addNewDriveRegistration}
            barangayName={session.barangay_name}
          />
        )
      ) : (
        // Office mode — existing 3-step flow
        <>
          <Step n={1} title="Owner" done={!!selectedOwner}
            summary={selectedOwner ? `${selectedOwner.owner_name} · ${selectedOwner.barangay_name ?? '—'}` : null}>
            {selectedOwner ? (
              <div className="encode-row">
                <p className="encode-hint">Selected.</p>
                <button type="button" className="btn btn-outline" onClick={resetOwnerStep}>Change owner</button>
              </div>
            ) : ownerMode === null ? (
              <div className="encode-choice">
                <button type="button" className="encode-choice-btn" onClick={() => setOwnerMode('existing')}>
                  <span className="encode-choice-icon" aria-hidden="true">EX</span>
                  <span><strong>Existing owner</strong><small>Search by name, contact, or barangay.</small></span>
                </button>
                <button type="button" className="encode-choice-btn" onClick={() => setOwnerMode('new')}>
                  <span className="encode-choice-icon" aria-hidden="true">+</span>
                  <span><strong>New owner</strong><small>Register a first-time pet owner.</small></span>
                </button>
              </div>
            ) : ownerMode === 'existing' ? (
              <>
                <div className="encode-row">
                  <input type="search" className="encode-input" placeholder="Search owners — name, contact, or barangay…"
                    value={ownerQuery} onChange={(e) => setOwnerQuery(e.target.value)} autoFocus />
                  <button type="button" className="btn btn-outline" onClick={resetOwnerStep}>← Back</button>
                </div>
                <ul className="encode-list">
                  {ownerSearching && <li className="encode-list-empty">Searching…</li>}
                  {!ownerSearching && ownerResults.length === 0 && (
                    <li className="encode-list-empty">
                      {ownerQuery ? 'No owners match.' : 'Type to search the registry.'}
                    </li>
                  )}
                  {!ownerSearching && ownerResults.map((o) => (
                    <li key={o.owner_id}>
                      <button type="button" className="encode-list-item" onClick={() => setSelectedOwner(o)}>
                        <span className="encode-list-main">{o.owner_name}</span>
                        <span className="encode-list-sub">{o.contact_number} · {o.barangay_name ?? '—'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {ownerResults.length === 20 && <p className="encode-hint">Showing first 20 — refine to narrow.</p>}
              </>
            ) : (
              <>
                <div className="encode-row">
                  <p className="encode-hint">Register a new owner.</p>
                  <button type="button" className="btn btn-outline" onClick={resetOwnerStep}>← Back</button>
                </div>
                <OwnerForm barangays={barangays} onSubmit={createOwner} />
              </>
            )}
          </Step>

          <Step n={2} title="Pet" disabled={!selectedOwner} done={!!selectedPet}
            summary={selectedPet ? `${selectedPet.pet_name} · ${selectedPet.pet_type} · ${selectedPet.pet_age}` : null}>
            {!selectedOwner ? (
              <p className="encode-hint">Select an owner first.</p>
            ) : selectedPet ? (
              <div className="encode-row">
                <p className="encode-hint">Selected.</p>
                <button type="button" className="btn btn-outline" onClick={() => selectPet(null)}>
                  Change pet
                </button>
              </div>
            ) : (
              <>
                <div className="encode-row">
                  <span className="encode-hint">{pets.length} pet(s) on file for {selectedOwner.owner_name}</span>
                  <button type="button" className="btn btn-outline" onClick={() => setShowPetForm((v) => !v)}>
                    {showPetForm ? 'Cancel' : '+ New pet'}
                  </button>
                </div>
                {showPetForm && <PetForm onSubmit={createPet} />}
                <ul className="encode-list">
                  {pets.length === 0 && !showPetForm && (
                    <li className="encode-list-empty">No pets yet. Add one to continue.</li>
                  )}
                  {pets.map((p) => (
                    <li key={p.pet_id}>
                      <button type="button" className="encode-list-item" onClick={() => selectPet(p)}>
                        <span className="encode-list-main">{p.pet_name}</span>
                        <span className="encode-list-sub">{p.pet_type} · {p.pet_age} · {p.pet_color}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Step>

          <Step n={3} title="Vaccination" disabled={!selectedPet}>
            {!selectedPet ? <p className="encode-hint">Select a pet first.</p> : (
              <>
                <VaccinationForm
                  key={vaccinationKey}
                  vets={vets} isDrive={false}
                  showVetForm={showVetForm}
                  onToggleVetForm={() => setShowVetForm((v) => !v)}
                  onCreateVet={createVet}
                  onSubmit={recordVaccination}
                />
                <div className="encode-history-head">
                  <h3 className="encode-subhead">
                    Vaccination history — {selectedPet.pet_name}
                  </h3>
                  {recent.length > 0 && (
                    <span className="encode-history-count">{recent.length} record{recent.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {recent.length === 0 ? (
                  <p className="encode-hint">No vaccinations recorded yet.</p>
                ) : (
                  <ul className="encode-recent">
                    {recent.map((r) => (
                      <li key={r.vaccine_id}>
                        <span className="encode-recent-date">{new Date(r.vaccine_date).toLocaleDateString()}</span>
                        <span className="encode-recent-main">{r.vaccine_details}</span>
                        <span className="encode-recent-sub">
                          Lot {r.manufacturer_no}
                          {' · '}{r.vet_name ?? '—'}
                          {' · '}{r.approval_code ?? '—'}
                          {r.is_office_visit ? ' · Pet Office' : ' · Barangay Drive'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Step>
        </>
      )}
    </main>
  )
}

// ── Sub-screens ──────────────────────────────────────────

function ModePicker({ onSelect, flash, error }) {
  return (
    <main className="encode" aria-label="Mode selection">
      <div className="encode-header">
        <h2>New vaccination record</h2>
        <p>Select recording mode to begin.</p>
      </div>
      {error && <div className="encode-banner encode-banner--error">{error}</div>}
      {flash && <div className="encode-banner encode-banner--ok">{flash}</div>}
      <div className="encode-choice">
        <button type="button" className="encode-choice-btn encode-choice-btn--lg" onClick={() => onSelect('office')}>
          <span className="encode-choice-icon encode-choice-icon--lg" aria-hidden="true">PO</span>
          <span>
            <strong>Pet Office</strong>
            <small>Individual clinic visits. Search for an owner and record per pet.</small>
          </span>
        </button>
        <button type="button" className="encode-choice-btn encode-choice-btn--lg" onClick={() => onSelect('drive')}>
          <span className="encode-choice-icon encode-choice-icon--lg" aria-hidden="true">BD</span>
          <span>
            <strong>Barangay Drive</strong>
            <small>Bulk vaccination per barangay. Session-based, all pets pre-loaded.</small>
          </span>
        </button>
      </div>
    </main>
  )
}

function DriveSetup({ barangays, onSelect, onBack, flash, error }) {
  const [search, setSearch]         = useState('')
  const [sessions, setSessions]     = useState([])
  const [searching, setSearching]   = useState(true)
  const [barangayId, setBarangayId] = useState('')
  const [date, setDate]             = useState(todayIso())
  const [saving, setSaving]         = useState(false)
  const [localError, setLocalError] = useState(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    const token = ++tokenRef.current
    setSearching(true)
    const id = setTimeout(() => {
      api.driveSessions.list(search || undefined)
        .then((data) => { if (token === tokenRef.current) { setSessions(data); setSearching(false) } })
        .catch(() => { if (token === tokenRef.current) setSearching(false) })
    }, search ? 250 : 0)
    return () => clearTimeout(id)
  }, [search])

  async function startSession(e) {
    e.preventDefault()
    setSaving(true); setLocalError(null)
    try {
      const created = await api.driveSessions.create({ barangay_id: Number(barangayId), session_date: date })
      onSelect(created)
    } catch (err) {
      setLocalError(err.message)
      setSaving(false)
    }
  }

  return (
    <main className="encode" aria-label="Drive session setup">
      <div className="encode-header">
        <h2>Barangay Drive Session</h2>
        <p>Search for an existing session to resume, or start a new one below.</p>
      </div>
      {(error || localError) && <div className="encode-banner encode-banner--error">{localError ?? error}</div>}
      {flash && <div className="encode-banner encode-banner--ok">{flash}</div>}

      <section className="encode-step">
        <header className="encode-step-head">
          <span className="encode-step-num" aria-hidden="true">+</span>
          <h3>New session</h3>
        </header>
        <div className="encode-step-body">
          <form className="encode-form" onSubmit={startSession}>
            <label>Barangay
              <select required value={barangayId} onChange={(e) => setBarangayId(e.target.value)} className="encode-input">
                <option value="">— select —</option>
                {barangays.map((b) => (
                  <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>
                ))}
              </select>
            </label>
            <label>Session date
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="encode-input" />
            </label>
            <div className="encode-form-actions">
              <button type="button" className="btn btn-outline" onClick={onBack}>← Back</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Starting…' : 'Start session'}
              </button>
            </div>
          </form>
        </div>
      </section>
      
      <section className="encode-step">
        <header className="encode-step-head">
          <span className="encode-step-num" aria-hidden="true">S</span>
          <h3>Find session</h3>
        </header>
        <div className="encode-step-body">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by barangay name…"
            className="encode-input"
            autoFocus
          />
          {searching ? (
            <p className="encode-hint">Searching…</p>
          ) : sessions.length === 0 ? (
            <p className="encode-hint">
              {search ? `No sessions found for "${search}".` : 'No sessions recorded yet.'}
            </p>
          ) : (
            <ul className="drive-sessions-list">
              {sessions.map((s) => (
                <li key={s.session_id}>
                  <button type="button" className="drive-sessions-item" onClick={() => onSelect(s)}>
                    <span className="drive-sessions-brgy">{s.barangay_name ?? `Barangay #${s.barangay_id}`}</span>
                    <span className="drive-sessions-date">{fmtDate(s.session_date)}</span>
                    <span className="drive-sessions-resume">Resume →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      
    </main>
  )
}

function SessionBanner({ mode, session, onChangeSession, onChangeMode }) {
  const label = mode === 'drive'
    ? `${session?.barangay_name ?? '—'} · ${fmtDate(session?.session_date)}`
    : 'Pet Office'

  return (
    <div className={`session-banner session-banner--${mode}`}>
      <span className="session-banner-mode">{mode === 'drive' ? 'Barangay Drive' : 'Pet Office'}</span>
      <span className="session-banner-label">{label}</span>
      <div className="session-banner-actions">
        {mode === 'drive' && (
          <button type="button" className="btn btn-outline session-banner-btn" onClick={onChangeSession}>
            Change session
          </button>
        )}
        <button type="button" className="btn btn-outline session-banner-btn" onClick={onChangeMode}>
          Change mode
        </button>
      </div>
    </div>
  )
}

function DrivePetList({ pets, filter, onFilterChange, onSelectPet, onCreatePet, onNewRegistration, barangayName }) {
  const [addingForOwner, setAddingForOwner] = useState(null)
  const [showNewReg, setShowNewReg]         = useState(false)

  const filtered = filter
    ? pets.filter((p) =>
        p.pet_name.toLowerCase().includes(filter.toLowerCase()) ||
        p.owner_name.toLowerCase().includes(filter.toLowerCase())
      )
    : pets

  const ownerGroups = groupByOwner(filtered)

  function handleAddPet(form, owner) {
    onCreatePet(form, owner)
    setAddingForOwner(null)
  }

  function handleNewRegistration(ownerForm, petForm) {
    onNewRegistration(ownerForm, petForm)
    setShowNewReg(false)
  }

  return (
    <section className="encode-step">
      <header className="encode-step-head">
        <span className="encode-step-num" aria-hidden="true">1</span>
        <h3>Select a pet — {barangayName}</h3>
        <span className="encode-step-summary">{pets.length} pet(s) loaded</span>
      </header>
      <div className="encode-step-body">
        <div className="drive-filter-row">
          <input
            type="search"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Filter by pet name or owner…"
            className="encode-input"
          />
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => { setShowNewReg((v) => !v); setAddingForOwner(null) }}
          >
            {showNewReg ? 'Cancel' : '+ New registration'}
          </button>
        </div>

        {showNewReg && (
          <DriveRegistrationForm
            onSubmit={handleNewRegistration}
            onCancel={() => setShowNewReg(false)}
          />
        )}

        {ownerGroups.length === 0 && !showNewReg ? (
          <p className="encode-hint">
            {filter ? 'No pets match your filter.' : 'No pets registered in this barangay yet — use "+ New registration" to add one.'}
          </p>
        ) : (
          <div className="drive-owners">
            {ownerGroups.map((owner) => {
              const isAdding = addingForOwner === owner.owner_id
              return (
                <div key={owner.owner_id} className="drive-owner">
                  <div className="drive-owner-head">
                    <span className="drive-owner-name">{owner.owner_name}</span>
                    <span className="drive-owner-contact">{owner.contact_number}</span>
                    <button
                      type="button"
                      className="drive-owner-add-btn"
                      onClick={() => setAddingForOwner(isAdding ? null : owner.owner_id)}
                    >
                      {isAdding ? 'Cancel' : '+ Add pet'}
                    </button>
                  </div>

                  {isAdding && (
                    <div className="drive-add-pet-form">
                      <PetForm onSubmit={(form) => handleAddPet(form, owner)} />
                    </div>
                  )}

                  {owner.pets.map((p) => (
                    <button key={p.pet_id} type="button" className="drive-pet-row" onClick={() => onSelectPet(p)}>
                      <span className="drive-pet-name">{p.pet_name}</span>
                      <span className="drive-pet-sub">{p.pet_type} · {p.pet_age} · {p.pet_color}</span>
                      <span className="drive-pet-action">Record →</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function DriveRecord({ pet, vets, showVetForm, onToggleVetForm, onCreateVet, onSubmit, onBack }) {
  const [history, setHistory] = useState([])

  useEffect(() => {
    api.vaccinations.list(pet.pet_id).then(setHistory).catch(() => {})
  }, [pet.pet_id])

  return (
    <section className="encode-step">
      <header className="encode-step-head">
        <span className="encode-step-num" aria-hidden="true">2</span>
        <h3>Vaccination</h3>
        <span className="encode-step-summary">{pet.pet_name} · {pet.owner_name}</span>
      </header>
      <div className="encode-step-body">
        <div className="drive-record-head">
          <button type="button" className="encode-link-btn" onClick={onBack}>← Back to pet list</button>
          <div className="drive-record-info">
            <span className="drive-record-pet">{pet.pet_name}</span>
            <span className="drive-record-sub">{pet.pet_type} · {pet.pet_age} · {pet.pet_color}</span>
            <span className="drive-record-owner">Owner: {pet.owner_name} · {pet.contact_number}</span>
          </div>
        </div>

        <VaccinationForm
          vets={vets} isDrive={true}
          showVetForm={showVetForm}
          onToggleVetForm={onToggleVetForm}
          onCreateVet={onCreateVet}
          onSubmit={onSubmit}
        />

        <div className="encode-history-head">
          <h3 className="encode-subhead">Vaccination history — {pet.pet_name}</h3>
          {history.length > 0 && (
            <span className="encode-history-count">
              {history.length} record{history.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {history.length === 0 ? (
          <p className="encode-hint">No vaccinations recorded yet.</p>
        ) : (
          <ul className="encode-recent">
            {history.map((r) => (
              <li key={r.vaccine_id}>
                <span className="encode-recent-date">{new Date(r.vaccine_date).toLocaleDateString()}</span>
                <span className="encode-recent-main">{r.vaccine_details}</span>
                <span className="encode-recent-sub">
                  Lot {r.manufacturer_no}
                  {' · '}{r.vet_name ?? '—'}
                  {' · '}{r.approval_code ?? '—'}
                  {r.is_office_visit ? ' · Pet Office' : ' · Barangay Drive'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function DriveRegistrationForm({ onSubmit, onCancel }) {
  const [owner, setOwner] = useState({ owner_name: '', contact_number: '', email: '' })
  const [pet, setPet]     = useState({ pet_name: '', pet_type: '', pet_age: '', pet_color: '' })
  const [wantsAccount, setWantsAccount] = useState(false)
  const updO = (k) => (e) => setOwner((p) => ({ ...p, [k]: e.target.value }))
  const updP = (k) => (e) => setPet((p) => ({ ...p, [k]: e.target.value }))
  function toggleAccount() {
    setWantsAccount((v) => { if (v) setOwner((p) => ({ ...p, email: '' })); return !v })
  }
  return (
    <form className="encode-form drive-reg-form" onSubmit={(e) => { e.preventDefault(); onSubmit(owner, pet) }}>
      <p className="encode-form-wide drive-reg-section">Owner info <span>(barangay pre-filled from session)</span></p>
      <label>Full name
        <input required autoFocus value={owner.owner_name} onChange={updO('owner_name')} className="encode-input" />
      </label>
      <label>
        <span>Contact number <span className="encode-label-hint">(optional)</span></span>
        <input value={owner.contact_number} onChange={updO('contact_number')} className="encode-input" />
      </label>
      <div className="encode-form-wide encode-account-toggle">
        <span className="encode-account-toggle-label">Create online account for owner</span>
        <button type="button" className={`encode-toggle-btn${wantsAccount ? ' is-on' : ''}`} onClick={toggleAccount} aria-pressed={wantsAccount}>
          <span className="encode-toggle-knob" />
        </button>
      </div>
      {wantsAccount && (
        <label className="encode-form-wide">
          <span>Email <span className="encode-label-hint">(will be used to log in online)</span></span>
          <input type="email" required value={owner.email} onChange={updO('email')} className="encode-input" placeholder="owner@example.com" />
        </label>
      )}
      <p className="encode-form-wide drive-reg-section">Pet info</p>
      <label>Pet name
        <input required value={pet.pet_name} onChange={updP('pet_name')} className="encode-input" />
      </label>
      <label>Type
        <input required placeholder="Dog / Cat / …" value={pet.pet_type} onChange={updP('pet_type')} className="encode-input" />
      </label>
      <label>Age
        <input required placeholder="e.g. 3 yrs" value={pet.pet_age} onChange={updP('pet_age')} className="encode-input" />
      </label>
      <label>Color
        <input required value={pet.pet_color} onChange={updP('pet_color')} className="encode-input" />
      </label>
      <div className="encode-form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">Register owner &amp; pet</button>
      </div>
    </form>
  )
}

// ── Shared form components ───────────────────────────────

function Step({ n, title, done, disabled, summary, children }) {
  return (
    <section className={`encode-step ${disabled ? 'is-disabled' : ''} ${done ? 'is-done' : ''}`}>
      <header className="encode-step-head">
        <span className="encode-step-num" aria-hidden="true">{done ? '✓' : n}</span>
        <h3>{title}</h3>
        {summary && <span className="encode-step-summary">{summary}</span>}
      </header>
      <div className="encode-step-body">{children}</div>
    </section>
  )
}

function OwnerForm({ barangays, onSubmit }) {
  const [form, setForm] = useState({ owner_name: '', contact_number: '', barangay_id: '', email: '' })
  const [wantsAccount, setWantsAccount] = useState(false)
  const update = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }))
  function toggleAccount() {
    setWantsAccount((v) => { if (v) setForm((p) => ({ ...p, email: '' })); return !v })
  }
  return (
    <form className="encode-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}>
      <label>Full name<input required value={form.owner_name} onChange={update('owner_name')} className="encode-input" /></label>
      <label>
        <span>Contact number <span className="encode-label-hint">(optional)</span></span>
        <input value={form.contact_number} onChange={update('contact_number')} className="encode-input" />
      </label>
      <div className="encode-form-wide encode-account-toggle">
        <span className="encode-account-toggle-label">Create online account for owner</span>
        <button type="button" className={`encode-toggle-btn${wantsAccount ? ' is-on' : ''}`} onClick={toggleAccount} aria-pressed={wantsAccount}>
          <span className="encode-toggle-knob" />
        </button>
      </div>
      {wantsAccount && (
        <label className="encode-form-wide">
          <span>Email <span className="encode-label-hint">(will be used to log in online)</span></span>
          <input type="email" required value={form.email} onChange={update('email')} className="encode-input" placeholder="owner@example.com" autoFocus />
        </label>
      )}
      <label className="encode-form-wide">Barangay
        <select required value={form.barangay_id} onChange={update('barangay_id')} className="encode-input">
          <option value="">— select —</option>
          {barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
        </select>
      </label>
      <div className="encode-form-actions"><button type="submit" className="btn btn-primary">Save owner</button></div>
    </form>
  )
}

function PetForm({ onSubmit }) {
  const [form, setForm] = useState({ pet_name: '', pet_type: '', pet_age: '', pet_color: '' })
  const update = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }))
  return (
    <form className="encode-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}>
      <label>Name<input required value={form.pet_name} onChange={update('pet_name')} className="encode-input" /></label>
      <label>Type<input required placeholder="Dog / Cat / …" value={form.pet_type} onChange={update('pet_type')} className="encode-input" /></label>
      <label>Age<input required placeholder="e.g. 3 yrs" value={form.pet_age} onChange={update('pet_age')} className="encode-input" /></label>
      <label>Color<input required value={form.pet_color} onChange={update('pet_color')} className="encode-input" /></label>
      <div className="encode-form-actions"><button type="submit" className="btn btn-primary">Save pet</button></div>
    </form>
  )
}

function VetForm({ onSubmit, onCancel }) {
  const [vet_name, setName] = useState('')
  function submit(e) { e.preventDefault(); if (!vet_name.trim()) return; onSubmit({ vet_name }, () => setName('')) }
  return (
    <form className="encode-vet-form" onSubmit={submit}>
      <input required value={vet_name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Full Name" className="encode-input" autoFocus />
      <button type="submit" className="btn btn-primary">Save</button>
      <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
    </form>
  )
}

function VaccinationForm({ vets, isDrive, showVetForm, onToggleVetForm, onCreateVet, onSubmit }) {
  const [form, setForm] = useState({
    vaccine_date: todayIso(),
    vet_id: '',
    vaccine_details: '',
    manufacturer_no: '',
    is_office_visit: false,
  })
  const [showConfirm, setShowConfirm] = useState(false)
  const formRef = useRef(null)

  const update = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }))

  function handleGenerateClick() {
    if (!formRef.current?.reportValidity()) return
    setShowConfirm(true)
  }
  function confirmSubmit() { setShowConfirm(false); onSubmit(form) }
  function handleCreateVet(payload) {
    onCreateVet(payload, (created) => setForm((prev) => ({ ...prev, vet_id: String(created.vet_id) })))
  }

  const selectedVet = vets.find((v) => String(v.vet_id) === form.vet_id)

  return (
    <>
      <form ref={formRef} className="encode-form encode-form--wide" onSubmit={(e) => e.preventDefault()}>
        <label>Date
          <input required type="date" value={form.vaccine_date} onChange={update('vaccine_date')} className="encode-input" />
        </label>
        <label className="encode-form-vet">
          <span className="encode-form-vet-head">
            <span>Veterinarian</span>
            <button type="button" className="encode-link-btn" onClick={onToggleVetForm}>
              {showVetForm ? 'Cancel' : '+ Add vet'}
            </button>
          </span>
          <select required value={form.vet_id} onChange={update('vet_id')} className="encode-input">
            <option value="">— select —</option>
            {vets.map((v) => <option key={v.vet_id} value={v.vet_id}>{v.vet_name}</option>)}
          </select>
        </label>
        <label>Manufacturer / lot #
          <input required value={form.manufacturer_no} onChange={update('manufacturer_no')} className="encode-input" />
        </label>
        <label>Vaccine
          <input
            required
            list="vaccine-list"
            placeholder="e.g. Rabisin, Dog 5-in-1"
            value={form.vaccine_details}
            onChange={update('vaccine_details')}
            className="encode-input"
          />
          <datalist id="vaccine-list">
            <option value="Rabisin" />
            <option value="Dog 5-in-1 (DHPP)" />
            <option value="Dog 6-in-1 (DHPP + Lepto)" />
            <option value="Kennel Cough (Bordetella)" />
            <option value="Cat 3-in-1 (FVRCP)" />
            <option value="Leptospirosis" />
            <option value="Parvovirus" />
            <option value="Distemper" />
            <option value="Anti-Rabies Booster" />
          </datalist>
        </label>

        {isDrive && (
          <label className="encode-form-wide encode-form-check">
            <input
              type="checkbox"
              checked={form.is_office_visit}
              onChange={(e) => setForm((prev) => ({ ...prev, is_office_visit: e.target.checked }))}
            />
            Vaccinated at Pet Office instead of on-site
          </label>
        )}

        {showVetForm && (
          <div className="encode-form-wide">
            <VetForm onSubmit={handleCreateVet} onCancel={onToggleVetForm} />
          </div>
        )}

        <div className="encode-form-actions">
          <button type="button" className="btn btn-primary" onClick={handleGenerateClick}>
            Generate Approval ID
          </button>
        </div>
      </form>

      {showConfirm && (
        <div className="modal-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Confirm Vaccination Record</h3>
            <p className="modal-body">Review the details below before generating an approval ID.</p>
            <div className="modal-summary">
              <div className="modal-summary-row">
                <span className="modal-summary-label">Date</span>
                <span>{new Date(form.vaccine_date + 'T00:00:00').toLocaleDateString()}</span>
              </div>
              <div className="modal-summary-row">
                <span className="modal-summary-label">Vet</span>
                <span>{selectedVet?.vet_name ?? '—'}</span>
              </div>
              <div className="modal-summary-row">
                <span className="modal-summary-label">Lot #</span>
                <span>{form.manufacturer_no}</span>
              </div>
              <div className="modal-summary-row">
                <span className="modal-summary-label">Vaccine</span>
                <span>{form.vaccine_details}</span>
              </div>
              {isDrive && (
                <div className="modal-summary-row">
                  <span className="modal-summary-label">Location</span>
                  <span>{form.is_office_visit ? 'Pet Office' : 'On-site (barangay drive)'}</span>
                </div>
              )}
            </div>
            <p className="modal-hint">An approval ID will be auto-generated on confirm.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmSubmit}>Confirm &amp; Generate</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
