import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../../local/api'
import { useAuth } from '../../../shared/AuthContext'
import './RegisterPage.css'

export default function RegisterPage() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const [form, setForm]       = useState({ display_name: '', email: '', password: '', confirm: '' })
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  const update = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError(null)

    if (form.password !== form.confirm) return setError('Passwords do not match.')
    if (form.password.length < 6)       return setError('Password must be at least 6 characters.')

    setLoading(true)
    try {
      const { user, token } = await api.auth.register({
        display_name: form.display_name,
        email:        form.email,
        password:     form.password,
      })
      login(user, token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.detail ?? err.message)
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <Link to="/" className="auth-back">← Back to home</Link>
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark">DV</span>
          <div>
            <span className="auth-brand-name">DIGIVET</span>
            <span className="auth-brand-sub">Lipa City Veterinary Office</span>
          </div>
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Create account</h1>
          <p className="auth-sub">Veterinary staff registration for the local system.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-label">
            Full name
            <input
              required
              value={form.display_name}
              onChange={update('display_name')}
              placeholder="Dr. Full Name"
              className="auth-input"
              autoFocus
            />
          </label>
          <label className="auth-label">
            Email address
            <input
              required
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
              className="auth-input"
            />
          </label>
          <label className="auth-label">
            Password
            <input
              required
              type="password"
              value={form.password}
              onChange={update('password')}
              placeholder="Min. 6 characters"
              className="auth-input"
            />
          </label>
          <label className="auth-label">
            Confirm password
            <input
              required
              type="password"
              value={form.confirm}
              onChange={update('confirm')}
              placeholder="Repeat password"
              className="auth-input"
            />
          </label>
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
