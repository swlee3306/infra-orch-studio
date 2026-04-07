import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../api'
import { useI18n } from '../i18n'

export default function LoginPage() {
  const nav = useNavigate()
  const { locale, setLocale, copy } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [allowSignup, setAllowSignup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    auth.publicConfig()
      .then((cfg) => {
        if (!cancelled) {
          setAllowSignup(Boolean(cfg.allow_public_signup))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllowSignup(false)
          setMode('login')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!allowSignup && mode === 'signup') {
      setMode('login')
    }
  }, [allowSignup, mode])

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-head">
          <div className="locale-toggle" aria-label="Language toggle">
            <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>
              EN
            </button>
            <button type="button" className={locale === 'ko' ? 'active' : ''} onClick={() => setLocale('ko')}>
              KR
            </button>
          </div>
        </div>
        <div className="auth-brand" style={{ marginBottom: 18 }}>
          <h1 className="auth-title">{copy.login.title}</h1>
          <p className="helper auth-subtitle">{copy.login.subtitle}</p>
        </div>

        <p className="helper auth-helper" style={{ marginBottom: 16 }}>
          {copy.login.helper}
        </p>

        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            {copy.login.login}
          </button>
          {allowSignup ? (
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
              {copy.login.signup}
            </button>
          ) : null}
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
              nav('/dashboard')
            } catch (err: any) {
              setError(err?.message || (locale === 'ko' ? '요청 실패' : 'failed'))
            } finally {
              setLoading(false)
            }
          }}
          className="form-grid"
        >
          <label className="field">
            <span>{copy.login.email}</span>
            <input
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <label className="field">
            <span>{copy.login.password}</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={locale === 'ko' ? '최소 8자 이상' : 'At least 8 characters'}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? (locale === 'ko' ? '처리 중...' : 'Working...') : mode === 'login' ? copy.login.login : copy.login.createAccount}
          </button>
        </form>

        {error ? <div className="error-box" style={{ marginTop: 14 }}>{String(error)}</div> : null}
        {!allowSignup ? (
          <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
            {locale === 'ko' ? '이 배포에서는 공개 가입이 비활성화되어 있습니다.' : 'Public signup is disabled for this deployment.'}
          </p>
        ) : null}
        <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
          {copy.login.apiBase}: {import.meta.env.VITE_API_URL || 'http://localhost:8080/api'}
        </p>
      </div>
    </div>
  )
}
