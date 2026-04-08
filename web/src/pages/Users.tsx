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
  const [users, setUsers] = useState<User[]>([])
  const [items, setItems] = useState<AuditEvent[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusTargetId, setStatusTargetId] = useState<string | null>(null)
  const [passwordTargetId, setPasswordTargetId] = useState<string | null>(null)
  const [nextPassword, setNextPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    setError(null)
    const me = await auth.me()
    setViewer(me)
    if (!me.is_admin) {
      setUsers([])
      setItems([])
      return
    }
    const usersRes = await auth.listUsers()
    setUsers(usersRes.items)
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

  async function onToggleUser(item: User) {
    setStatusTargetId(item.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await auth.setUserDisabled(item.id, { disabled: !item.is_disabled })
      setNotice(
        ko
          ? `${updated.email} 계정을 ${updated.is_disabled ? '비활성화' : '재활성화'}했습니다.`
          : `${updated.is_disabled ? 'Disabled' : 'Re-enabled'} ${updated.email}.`,
      )
      await load()
    } catch (err: any) {
      setError(err?.message || 'failed')
    } finally {
      setStatusTargetId(null)
    }
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!passwordTargetId || !nextPassword) return
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await auth.resetUserPassword(passwordTargetId, { password: nextPassword })
      setNotice(ko ? `${updated.email} 계정의 비밀번호를 갱신했습니다.` : `Updated password for ${updated.email}.`)
      setNextPassword('')
      setPasswordTargetId(null)
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
              <h2>{copy.users.currentUsers}</h2>
            </div>
          </div>
          <div className="stack-list">
            {users.length === 0 ? (
              <div className="empty-state">{copy.users.noUsers}</div>
            ) : (
              users.map((item) => (
                <div key={item.id} className="stack-row">
                  <div>
                    <strong>{item.email}</strong>
                    <div className="row-meta">
                      {copy.users.createdAt} · {formatAuditTime(item.created_at)}
                    </div>
                  </div>
                  <div className="detail-actions">
                    <span className={`badge ${item.is_disabled ? 'badge-failed' : 'badge-done'}`}>{item.is_disabled ? copy.users.statusDisabled : copy.users.statusActive}</span>
                    <span className="badge badge-muted">{item.is_admin ? copy.users.roleAdmin : copy.users.roleUser}</span>
                    <button
                      type="button"
                      className={item.is_disabled ? 'ghost' : 'danger'}
                      disabled={statusTargetId === item.id || (viewer?.id === item.id && item.is_admin)}
                      onClick={() => onToggleUser(item)}
                    >
                      {statusTargetId === item.id
                        ? item.is_disabled
                          ? copy.users.enabling
                          : copy.users.disabling
                        : item.is_disabled
                          ? copy.users.enable
                          : copy.users.disable}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={loading}
                      onClick={() => {
                        setPasswordTargetId(item.id)
                        setNextPassword('')
                        setNotice(null)
                        setError(null)
                      }}
                    >
                      {copy.users.resetPassword}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        {passwordTargetId ? (
          <article className="console-card">
            <div className="section-head">
              <div>
                <div className="section-kicker">{copy.users.kicker}</div>
                <h2>{copy.users.resetPassword}</h2>
              </div>
            </div>
            <form className="form-grid" onSubmit={onResetPassword}>
              <label className="field">
                <span>{copy.users.passwordFor}</span>
                <input
                  value={users.find((item) => item.id === passwordTargetId)?.email || ''}
                  readOnly
                />
              </label>
              <label className="field">
                <span>{copy.users.password}</span>
                <input
                  type="password"
                  value={nextPassword}
                  onChange={(e) => setNextPassword(e.target.value)}
                  placeholder={ko ? '최소 8자 이상' : 'At least 8 characters'}
                />
              </label>
              <div className="detail-actions">
                <button type="submit" disabled={loading || !nextPassword}>
                  {loading ? copy.users.resettingPassword : copy.users.resetPassword}
                </button>
                <button type="button" className="ghost" onClick={() => setPasswordTargetId(null)}>
                  {ko ? '취소' : 'Cancel'}
                </button>
              </div>
            </form>
          </article>
        ) : null}

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
              <div className="empty-state">{copy.users.noProvisioning}</div>
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
                    <span className="badge badge-muted">{metadata?.is_admin ? copy.users.roleAdmin : copy.users.roleUser}</span>
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
