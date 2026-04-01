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
    <div style={{ maxWidth: 420 }}>
      <h3>Login</h3>
      <p style={{ color: '#555' }}>API URL: {import.meta.env.VITE_API_URL || 'http://localhost:8080'}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button disabled={mode === 'login'} onClick={() => setMode('login')}>
          Login
        </button>
        <button disabled={mode === 'signup'} onClick={() => setMode('signup')}>
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
      >
        <label style={{ display: 'block', marginBottom: 8 }}>
          Email
          <input style={{ width: '100%' }} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Password
          <input
            style={{ width: '100%' }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? '…' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </form>

      {error && (
        <pre style={{ marginTop: 12, color: 'crimson', whiteSpace: 'pre-wrap' }}>{String(error)}</pre>
      )}
    </div>
  )
}
