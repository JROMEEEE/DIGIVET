import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../../local/api'
import { useAuth } from '../../../shared/AuthContext'
import './LoginPage.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form, setForm]     = useState({ email: '', password: '' })
  const [error, setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  const update = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      const { user, token } = await api.auth.login(form)
      login(user, token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
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
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-sub">Welcome back. Enter your credentials to continue.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-label">
            Email address
            <input
              required
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
              className="auth-input"
              autoFocus
            />
          </label>
          <label className="auth-label">
            Password
            <input
              required
              type="password"
              value={form.password}
              onChange={update('password')}
              placeholder="••••••••"
              className="auth-input"
            />
          </label>
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register" className="auth-link">Create one</Link>
        </p>
      </div>
    </div>
  )
}
