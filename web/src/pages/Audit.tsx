import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuditEvent, audit, auth, environments, Environment } from '../api'
import { useI18n } from '../i18n'

type AuditRecord = AuditEvent & {
  environmentName?: string
  environmentStatus?: string
}

type AuditFilter = 'all' | 'approvals' | 'mutations' | 'destroy' | 'failures'

function parseJson(value?: string): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function primaryEnvironmentRoute(environmentId: string, items: Environment[]): string {
  const environment = items.find((item) => item.id === environmentId)
  if (!environment) return `/environments/${environmentId}`
  if (environment.status === 'pending_approval') return `/environments/${environmentId}/review`
  if (environment.approval_status === 'approved') return `/environments/${environmentId}/approval`
  return `/environments/${environmentId}`
}

export default function AuditPage() {
  const nav = useNavigate()
  const { copy } = useI18n()
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [environmentItems, setEnvironmentItems] = useState<Environment[]>([])
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AuditFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const me = await auth.me()
      setViewer(me)
    } catch {
      nav('/login')
      return
    }

    try {
      const [environmentRes, auditRes] = await Promise.all([
        environments.list(200),
        audit.list({ limit: 200, resource_type: 'environment' }),
      ])
      setEnvironmentItems(environmentRes.items)
      const merged = auditRes.items
        .map((item) => {
          const environment = environmentRes.items.find((env) => env.id === item.resource_id)
          return {
            ...item,
            environmentName: environment?.name,
            environmentStatus: environment?.status,
          }
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setRecords(merged)
    } catch (err: any) {
      setError(err?.message || 'failed to load audit records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter((item) => {
      if (filter === 'approvals' && !item.action.includes('approved')) return false
      if (filter === 'mutations' && !item.action.match(/plan|apply/)) return false
      if (filter === 'destroy' && !item.action.includes('destroy')) return false
      if (filter === 'failures' && !item.action.includes('failed')) return false
      if (!query) return true
      return [item.action, item.actor_email, item.message, item.environmentName, item.environmentStatus]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [filter, records, search])

  const counts = useMemo(() => {
    return filtered.reduce(
      (acc, item) => {
        acc.total += 1
        if (item.action.includes('approved')) acc.approvals += 1
        if (item.action.includes('destroy')) acc.destroy += 1
        if (item.action.includes('failed')) acc.failed += 1
        if (item.action.includes('apply') || item.action.includes('plan')) acc.mutations += 1
        return acc
      },
      { total: 0, approvals: 0, destroy: 0, failed: 0, mutations: 0 },
    )
  }, [filtered])

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{copy.audit.kicker}</div>
          <h1 className="page-title">{copy.audit.title}</h1>
          <p className="page-copy">{copy.audit.copy}</p>
        </div>
        <div className="hero-actions">
          <span className="badge badge-muted">{copy.audit.viewer}: {viewer?.email || 'loading...'}</span>
          <button className="ghost" onClick={load}>
            {copy.audit.refresh}
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>Total events</span>
          <strong>{counts.total}</strong>
          <p>Filtered audit records returned by the global environment audit feed.</p>
        </article>
        <article className="metric-card">
          <span>Approvals</span>
          <strong>{counts.approvals}</strong>
          <p>Approval and approval-adjacent lifecycle events.</p>
        </article>
        <article className="metric-card">
          <span>Mutations</span>
          <strong>{counts.mutations}</strong>
          <p>Plan and apply requests or execution results tied to changes.</p>
        </article>
        <article className="metric-card">
          <span>Failures / destroy</span>
          <strong>
            {counts.failed} / {counts.destroy}
          </strong>
          <p>Operational risk markers surfaced from the current audit set.</p>
        </article>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">Filters</div>
            <h2>Search actor, action, environment, or message</h2>
          </div>
          <span className="badge badge-muted">{loading ? 'loading' : `${filtered.length} visible`}</span>
        </div>
        <div className="toolbar-row">
          <input
            className="ops-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, environment, actor, or message"
          />
          <div className="chip-row">
            {[
              ['all', 'All'],
              ['approvals', 'Approvals'],
              ['mutations', 'Plan / Apply'],
              ['destroy', 'Destroy'],
              ['failures', 'Failures'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip ${filter === value ? 'filter-chip-active' : ''}`}
                onClick={() => setFilter(value as AuditFilter)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">Audit stream</div>
            <h2>Environment history</h2>
          </div>
        </div>
        <div className="audit-list">
          {filtered.length === 0 ? (
            <div className="empty-state">No audit events match the current query.</div>
          ) : (
            filtered.map((item) => {
              const metadata = parseJson(item.metadata_json)
              return (
                <div className="audit-item" key={item.id}>
                  <div className="detail-top" style={{ alignItems: 'center' }}>
                    <strong>{item.action}</strong>
                    <span className="badge badge-muted">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <div className="info-grid info-grid-three" style={{ marginTop: 10 }}>
                    <div className="meta-item">
                      <span>Environment</span>
                      <strong>
                        <Link to={primaryEnvironmentRoute(item.resource_id, environmentItems)} className="text-link">
                          {item.environmentName || item.resource_id}
                        </Link>
                      </strong>
                    </div>
                    <div className="meta-item">
                      <span>Actor</span>
                      <strong>{item.actor_email || 'system'}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Status</span>
                      <strong>{item.environmentStatus || '-'}</strong>
                    </div>
                  </div>
                  {item.message ? <div style={{ marginTop: 10 }}>{item.message}</div> : null}
                  {metadata ? (
                    <pre className="json-block" style={{ marginTop: 10 }}>
                      {JSON.stringify(metadata, null, 2)}
                    </pre>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
