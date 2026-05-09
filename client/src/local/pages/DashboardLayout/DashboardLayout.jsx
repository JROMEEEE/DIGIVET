import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { DbStatusBadge } from '../../components/DbStatusBadge/DbStatusBadge'
import { useAuth } from '../../../shared/AuthContext'
import { api } from '../../api'
import './DashboardLayout.css'

const navItems = [
  { to: '/dashboard',             label: 'Overview',       icon: 'OV', end: true },
  { to: '/dashboard/encode',      label: 'Encode',         icon: 'EN' },
  { to: '/dashboard/records',     label: 'Records',        icon: 'RC' },
  { to: '/dashboard/analytics',   label: 'Analytics',      icon: 'AN' },
  { to: '/dashboard/vets',        label: 'Veterinarians',  icon: 'VT' },
  { to: '/dashboard/sync',        label: 'Sync',           icon: 'SY' },
]

const titles = {
  '/dashboard':               { title: 'Dashboard',     crumb: 'Admin · Overview' },
  '/dashboard/encode':        { title: 'Encode',        crumb: 'Admin · Encoding' },
  '/dashboard/records':       { title: 'Records',       crumb: 'Admin · Records' },
  '/dashboard/analytics':     { title: 'Analytics',     crumb: 'Admin · Analytics' },
  '/dashboard/vets':          { title: 'Veterinarians', crumb: 'Admin · Veterinarians' },
  '/dashboard/sync':          { title: 'Sync',          crumb: 'Admin · Sync to Supabase' },
}

function initials(name) {
  if (!name) return 'A'
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function DashboardLayout() {
  const location              = useLocation()
  const navigate              = useNavigate()
  const { user, login, logout } = useAuth()
  const meta = titles[location.pathname] ?? { title: 'Dashboard', crumb: 'Admin' }

  const [showSettings, setShowSettings] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  async function handleDelete() {
    await api.auth.deleteMe()
    logout()
    navigate('/login', { replace: true })
  }

  async function handleUpdate(form) {
    const { user: updated } = await api.auth.updateMe(form)
    // Refresh stored user — id is now a UUID string
    const token = localStorage.getItem('digivet_token')
    login(updated, token)
  }

  return (
    <div className="dash">
      <aside className="dash-sidebar" aria-label="Admin navigation">
        <Link to="/" className="dash-brand" aria-label="DIGIVET home">
          <span className="brand-mark" aria-hidden="true">DV</span>
          <span className="dash-brand-text">
            <span className="brand-name">DIGIVET</span>
            <span className="dash-brand-sub">Local System</span>
          </span>
        </Link>

        <nav className="dash-nav" aria-label="Admin sections">
          <div className="dash-nav-group">Workspace</div>
          <ul>
            {navItems.map((item) => (
              <li key={item.to}>
                {item.disabled ? (
                  <button type="button" className="dash-nav-item is-disabled" disabled>
                    <span className="dash-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="dash-nav-soon">soon</span>
                  </button>
                ) : (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `dash-nav-item ${isActive ? 'is-active' : ''}`}
                  >
                    <span className="dash-nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="dash-sidebar-foot">
          <span className="badge-unofficial">Unofficial</span>
          <span className="dash-sidebar-version">v0.1.0</span>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div className="dash-topbar-left">
            <h1 className="dash-page-title">{meta.title}</h1>
            <span className="dash-breadcrumb">{meta.crumb}</span>
          </div>

          <div className="dash-topbar-right">
            <DbStatusBadge />
            {user && (
              <span className="dash-user-name" title={user.email}>
                {user.display_name}
              </span>
            )}
            <button
              type="button"
              className="dash-avatar"
              aria-label="Account settings"
              title="Account settings"
              onClick={() => setShowSettings(true)}
            >
              {initials(user?.display_name)}
            </button>
          </div>
        </header>

        <Outlet />
      </div>

      {showSettings && (
        <AccountSettingsModal
          user={user}
          onClose={() => setShowSettings(false)}
          onLogout={handleLogout}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

/* ── Account settings modal ─────────────────────────────────── */
function AccountSettingsModal({ user, onClose, onLogout, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    display_name: user?.display_name ?? '',
    email:        user?.email        ?? '',
    password:     '',
    confirm:      '',
  })
  const [saving, setSaving]               = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError]                 = useState(null)
  const [flash, setFlash]                 = useState(null)

  const update = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setError(null)
    if (form.password && form.password !== form.confirm) {
      return setError('Passwords do not match.')
    }
    if (form.password && form.password.length < 6) {
      return setError('New password must be at least 6 characters.')
    }
    setSaving(true)
    try {
      const payload = {}
      if (form.display_name.trim() !== user?.display_name) payload.display_name = form.display_name.trim()
      if (form.email.trim()        !== user?.email)         payload.email        = form.email.trim()
      if (form.password)                                     payload.password     = form.password

      if (Object.keys(payload).length === 0) {
        setFlash('No changes to save.')
        setSaving(false)
        return
      }
      await onUpdate(payload)
      setForm((p) => ({ ...p, password: '', confirm: '' }))
      setFlash('Changes saved.')
      setTimeout(() => setFlash(null), 3000)
    } catch (err) {
      setError(err.detail ?? err.message)
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    setDeleting(true)
    try {
      await onDelete()
    } catch (err) {
      setError(err.detail ?? err.message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal acct-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Account settings"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="acct-modal-head">
          <div className="acct-modal-identity">
            <span className="acct-modal-avatar">{initials(user?.display_name)}</span>
            <div>
              <span className="acct-modal-name">{user?.display_name}</span>
              <span className="acct-modal-email">{user?.email}</span>
            </div>
            <span className="acct-modal-role-badge">Vet / Admin</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Edit form */}
        <div className="acct-modal-body">
          {error && <div className="acct-banner acct-banner--error">{error}</div>}
          {flash && <div className="acct-banner acct-banner--ok">{flash}</div>}

          <form className="acct-form" onSubmit={save}>
            <h4 className="acct-section-title">Edit account</h4>
            <label className="acct-label">
              Full name
              <input
                value={form.display_name}
                onChange={update('display_name')}
                className="encode-input"
                placeholder="Dr. Full Name"
              />
            </label>
            <label className="acct-label">
              Email address
              <input
                type="email"
                value={form.email}
                onChange={update('email')}
                className="encode-input"
              />
            </label>
            <label className="acct-label">
              New password
              <input
                type="password"
                value={form.password}
                onChange={update('password')}
                className="encode-input"
                placeholder="Leave blank to keep current"
              />
            </label>
            {form.password && (
              <label className="acct-label">
                Confirm new password
                <input
                  type="password"
                  value={form.confirm}
                  onChange={update('confirm')}
                  className="encode-input"
                  placeholder="Repeat new password"
                />
              </label>
            )}
            <button type="submit" className="btn btn-primary acct-save-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>

          {/* Divider */}
          <div className="acct-divider" />

          {/* Logout */}
          <button type="button" className="btn btn-outline acct-action-btn" onClick={onLogout}>
            Sign out
          </button>

          {/* Delete */}
          {!confirmDelete ? (
            <button
              type="button"
              className="acct-delete-btn"
              onClick={() => setConfirmDelete(true)}
            >
              Delete account
            </button>
          ) : (
            <div className="acct-delete-confirm">
              <p>This will permanently delete your account. Are you sure?</p>
              <div className="acct-delete-actions">
                <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-danger" onClick={doDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
