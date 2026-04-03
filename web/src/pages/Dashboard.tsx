import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, environments, Environment, User } from '../api'
import StatusBadge from '../components/StatusBadge'
import { summarizeOperatorError } from '../utils/uiCopy'

function formatUpdated(value?: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function nextEnvironmentRoute(item: Environment): string {
  if (item.status === 'pending_approval') return `/environments/${item.id}/review`
  if (item.approval_status === 'approved') return `/environments/${item.id}/approval`
  return `/environments/${item.id}`
}

export default function DashboardPage() {
  const nav = useNavigate()
  const [viewer, setViewer] = useState<User | null>(null)
  const [items, setItems] = useState<Environment[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const me = await auth.me()
      setViewer(me)
    } catch {
      nav('/login')
      return
    }

    try {
      const res = await environments.list(100)
      setItems(res.items)
      setViewer(res.viewer)
    } catch (err: any) {
      setError(err?.message || 'failed to load dashboard')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const summary = useMemo(() => {
    const base = {
      total: items.length,
      active: 0,
      pending: 0,
      failed: 0,
      planning: 0,
      applying: 0,
      approved: 0,
    }
    for (const item of items) {
      if (item.status === 'active') base.active += 1
      if (item.status === 'pending_approval') base.pending += 1
      if (item.status === 'failed') base.failed += 1
      if (item.status === 'planning') base.planning += 1
      if (item.status === 'applying') base.applying += 1
      if (item.approval_status === 'approved') base.approved += 1
    }
    return base
  }, [items])

  const pendingApprovals = useMemo(
    () => items.filter((item) => item.status === 'pending_approval').slice(0, 5),
    [items],
  )
  const incidents = useMemo(() => items.filter((item) => item.status === 'failed').slice(0, 5), [items])
  const recent = useMemo(() => items.slice(0, 6), [items])

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">Ops // Core</div>
          <h1 className="page-title">Environment orchestration control</h1>
          <p className="page-copy">
            Start from environment posture, then drill into approvals, failures, and recent lifecycle changes.
          </p>
          <div className="row-meta" style={{ marginTop: 12 }}>
            Viewer {viewer?.email || 'loading...'} · {viewer?.is_admin ? 'admin' : 'operator'}
          </div>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>Refresh dashboard</button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>Active environments</span>
          <strong>{summary.active}</strong>
          <p>Environments currently running after a successful apply.</p>
        </article>
        <article className="metric-card">
          <span>Pending approvals</span>
          <strong>{summary.pending}</strong>
          <p>Plans blocked at approval before apply can be queued.</p>
        </article>
        <article className="metric-card">
          <span>Failed executions</span>
          <strong>{summary.failed}</strong>
          <p>Environments paused on a failed plan or apply step.</p>
        </article>
        <article className="metric-card">
          <span>In flight</span>
          <strong>{summary.planning + summary.applying}</strong>
          <p>Plans and applies currently moving through the runner.</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Approvals</div>
              <h2>Approval required</h2>
            </div>
            <Link to="/environments" className="text-link">
              View all
            </Link>
          </div>
          <div className="stack-list">
            {pendingApprovals.length === 0 ? (
              <div className="empty-state">No plans are waiting for approval.</div>
            ) : (
              pendingApprovals.map((item) => (
                <Link key={item.id} to={nextEnvironmentRoute(item)} className="stack-row stack-row-link">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="row-meta">{item.spec.tenant_name || '-'} · {item.operation || '-'}</div>
                  </div>
                  <StatusBadge status={item.status} />
                </Link>
              ))
            )}
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Failures</div>
              <h2>Failed environments</h2>
            </div>
            <Link to="/jobs" className="text-link">
              Open executions
            </Link>
          </div>
          <div className="stack-list">
            {incidents.length === 0 ? (
              <div className="empty-state">No failed environments in the current snapshot.</div>
            ) : (
              incidents.map((item) => (
                <Link key={item.id} to={`/environments/${item.id}`} className="stack-row stack-row-link">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="row-meta">{summarizeOperatorError(item.last_error || 'Execution failed. Review detail.')}</div>
                  </div>
                  <StatusBadge status={item.status} />
                </Link>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Environment list</div>
              <h2>Recent lifecycle records</h2>
            </div>
            <Link to="/environments" className="text-link">
              Open environment list
            </Link>
          </div>
          <div className="table-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Environment</th>
                  <th>Lifecycle</th>
                  <th>Approval</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={nextEnvironmentRoute(item)} className="text-link">
                        {item.name}
                      </Link>
                      <div className="row-meta">{item.spec.tenant_name || '-'}</div>
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      <StatusBadge status={item.approval_status} />
                    </td>
                    <td>{item.created_by_email || '-'}</td>
                    <td>{formatUpdated(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Lifecycle</div>
              <h2>Environment lifecycle control</h2>
            </div>
          </div>
          <div className="lifecycle-strip">
            <div className="lifecycle-step">
              <span>01 Request</span>
              <strong>{summary.total}</strong>
            </div>
            <div className="lifecycle-step">
              <span>02 Plan</span>
              <strong>{summary.planning}</strong>
            </div>
            <div className="lifecycle-step">
              <span>03 Approval</span>
              <strong>{summary.pending}</strong>
            </div>
            <div className="lifecycle-step">
              <span>04 Apply</span>
              <strong>{summary.applying}</strong>
            </div>
            <div className="lifecycle-step">
              <span>05 Result</span>
              <strong>{summary.active}</strong>
            </div>
          </div>
          <div className="note-card">
            <strong>Environment-first posture</strong>
            <p>
              Jobs remain visible as execution records, but operators should start from the environment object and only drill down
              when a run needs inspection.
            </p>
          </div>
        </article>
      </section>
    </div>
  )
}
