import React, { useEffect, useMemo, useState } from 'react'
import { audit, auth, AuditEvent, User } from '../api'
import { useI18n } from '../i18n'
import { summarizeOperatorError } from '../utils/uiCopy'

function formatAuditTime(value?: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function parseJson(value?: string): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function UsersPage() {
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
  const [viewer, setViewer] = useState<User | null>(null)
  const [items, setItems] = useState<AuditEvent[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    setError(null)
    const me = await auth.me()
    setViewer(me)
    const auditRes = await audit.list({ limit: 100, resource_type: 'user' })
    setItems(auditRes.items)
  }

  useEffect(() => {
    load().catch((err: any) => setError(err?.message || 'failed'))
  }, [])

  const visibleItems = useMemo(() => items.filter((item) => item.action === 'user.provisioned'), [items])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const created = await auth.createUser({ email, password, is_admin: isAdmin })
      setNotice(ko ? `${created.email} 계정을 생성했습니다.` : `Created ${created.email}.`)
      setEmail('')
      setPassword('')
      setIsAdmin(false)
      await load()
    } catch (err: any) {
      setError(err?.message || 'failed')
    } finally {
      setLoading(false)
    }
  }

  if (viewer && !viewer.is_admin) {
    return (
      <div className="page-stack">
        <section className="hero-panel">
          <div>
            <div className="page-kicker">{copy.users.kicker}</div>
            <h1 className="page-title">{copy.users.title}</h1>
            <p className="page-copy">{copy.users.copy}</p>
          </div>
        </section>
        <section className="error-box">{copy.users.adminOnly}</section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{copy.users.kicker}</div>
          <h1 className="page-title">{copy.users.title}</h1>
          <p className="page-copy">{copy.users.copy}</p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={() => load().catch((err: any) => setError(err?.message || 'failed'))}>
            {copy.users.refresh}
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}
      {notice ? <section className="success-box">{notice}</section> : null}

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{copy.users.kicker}</div>
              <h2>{copy.users.createUser}</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={onSubmit}>
            <label className="field">
              <span>{copy.users.email}</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operator@example.com" />
            </label>
            <label className="field">
              <span>{copy.users.password}</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={ko ? '최소 8자 이상' : 'At least 8 characters'} />
            </label>
            <label className="field field-checkbox">
              <span>{copy.users.admin}</span>
              <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            </label>
            <button type="submit" disabled={loading || !email || !password}>
              {loading ? copy.users.creating : copy.users.createUser}
            </button>
          </form>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{copy.users.kicker}</div>
              <h2>{copy.users.recentProvisioning}</h2>
            </div>
          </div>
          <div className="stack-list">
            {visibleItems.length === 0 ? (
              <div className="empty-state">{ko ? '아직 계정 생성 이력이 없습니다.' : 'No user provisioning activity yet.'}</div>
            ) : (
              visibleItems.map((item) => {
                const metadata = parseJson(item.metadata_json)
                return (
                  <div key={item.id} className="stack-row">
                    <div>
                      <strong>{metadata?.email || item.resource_id}</strong>
                      <div className="row-meta">
                        {(item.actor_email || (ko ? '시스템' : 'system'))} · {formatAuditTime(item.created_at)}
                      </div>
                    </div>
                    <span className="badge badge-muted">{metadata?.is_admin ? (ko ? '관리자' : 'admin') : ko ? '사용자' : 'user'}</span>
                  </div>
                )
              })
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
