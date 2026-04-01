import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../api'

export default function LoginPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <h1>Infra Orch Studio</h1>
          <p className="helper">Plan, review, and apply OpenStack environments from one operator console.</p>
        </div>

        <p className="helper" style={{ marginBottom: 16 }}>
          Session auth uses an httpOnly cookie. Passwords must be at least 8 characters.
        </p>

        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setLoading(true)
            setError(null)
            try {
              if (mode === 'login') {
                await auth.login(email, password)
              } else {
                await auth.signup(email, password)
              }
              nav('/jobs')
            } catch (err: any) {
              setError(err?.message || 'failed')
            } finally {
              setLoading(false)
            }
          }}
          className="form-grid"
        >
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Working...' : mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>

        {error ? <div className="error-box" style={{ marginTop: 14 }}>{String(error)}</div> : null}
        <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
          API base: {import.meta.env.VITE_API_URL || 'http://localhost:8080/api'}
        </p>
      </div>
    </div>
  )
}
