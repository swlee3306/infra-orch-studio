import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, EnvironmentSpec, jobs, Job, User } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import StatusBadge from '../components/StatusBadge'
import { summarizeOperatorError } from '../utils/uiCopy'

function createDefaultSpec(): EnvironmentSpec {
  return {
    environment_name: 'demo',
    tenant_name: 'infra',
    network: { name: 'demo-net', cidr: '10.0.0.0/24' },
    subnet: { name: 'demo-subnet', cidr: '10.0.0.0/24', gateway_ip: '10.0.0.1', enable_dhcp: true },
    instances: [
      {
        name: 'controller-1',
        image: 'ubuntu-22.04',
        flavor: 'm1.small',
        ssh_key_name: 'default',
        count: 1,
      },
    ],
  }
}

export default function JobsPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<Job[]>([])
  const [viewer, setViewer] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [spec, setSpec] = useState<EnvironmentSpec>(createDefaultSpec)
  const [showLegacyForm, setShowLegacyForm] = useState(false)

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
      const res = await jobs.list(50)
      setItems(res.items)
      setViewer(res.viewer)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  const counts = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc.total += 1
          if (item.status === 'queued') acc.queued += 1
          else if (item.status === 'running') acc.running += 1
          else if (item.status === 'done') acc.done += 1
          else if (item.status === 'failed') acc.failed += 1
          return acc
        },
        { total: 0, queued: 0, running: 0, done: 0, failed: 0 },
      ),
    [items],
  )

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="shell">
      <div className="grid">
        <section className="panel hero">
          <div className="hero-copy">
            <p className="muted" style={{ marginTop: 0 }}>
              Execution workspace
            </p>
            <h2>Inspect raw job execution after the environment workflow has queued work.</h2>
            <p className="helper">
              Environment lifecycle actions should start from the environments screen. This page is the lower-level
              execution ledger for jobs, logs, and derived plan/apply records.
            </p>
            <div className="detail-actions">
              <button className="ghost" onClick={load}>Refresh</button>
              <span className="badge badge-muted">Viewer: {viewer ? viewer.email : 'loading...'}</span>
              {viewer?.is_admin ? (
                <span className="badge badge-running">admin</span>
              ) : (
                <span className="badge badge-muted">operator</span>
              )}
            </div>
          </div>

          <div className="grid-two">
            <div className="meta-item">
              <span>Total</span>
              <strong>{counts.total}</strong>
            </div>
            <div className="meta-item">
              <span>Running</span>
              <strong>{counts.running}</strong>
            </div>
            <div className="meta-item">
              <span>Queued</span>
              <strong>{counts.queued}</strong>
            </div>
            <div className="meta-item">
              <span>Failed</span>
              <strong>{counts.failed}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="detail-top" style={{ marginBottom: 12 }}>
            <div>
              <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                Legacy plan request
              </p>
              <strong>Create a raw plan job without a first-class environment aggregate.</strong>
            </div>
            <div className="detail-actions">
              <span className="badge badge-muted">Advanced</span>
              <button type="button" className="ghost" onClick={() => setShowLegacyForm((current) => !current)}>
                {showLegacyForm ? 'Hide legacy form' : 'Open legacy form'}
              </button>
            </div>
          </div>

          {showLegacyForm ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault()
                setCreateError(null)
                setCreating(true)
                try {
                  const created = await jobs.plan(spec)
                  nav(`/jobs/${created.id}`)
                } catch (err: any) {
                  setCreateError(err?.message || 'failed to create plan')
                } finally {
                  setCreating(false)
                }
              }}
            >
              <EnvironmentSpecForm value={spec} onChange={setSpec} />
              {createError ? <div className="error-box">{summarizeOperatorError(createError)}</div> : null}
              <div className="detail-actions">
                <button type="submit" disabled={creating}>
                  {creating ? 'Creating...' : 'Create plan job'}
                </button>
                <button type="button" className="ghost" onClick={() => setSpec(createDefaultSpec())} disabled={creating}>
                  Reset
                </button>
              </div>
            </form>
          ) : (
            <div className="callout callout-info">
              <strong>Legacy execution form is collapsed</strong>
              <p style={{ margin: '6px 0 0' }}>
                Use the environment workflow for normal operations. Open this form only when you need a raw execution record for diagnostics or compatibility testing.
              </p>
            </div>
          )}
        </section>
      </div>

      {error ? (
        <section className="panel error-box" style={{ marginTop: 18 }}>
          {summarizeOperatorError(error)}
        </section>
      ) : null}

      <section className="panel">
        <div className="detail-top" style={{ marginBottom: 12 }}>
          <div>
              <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                Recent executions
              </p>
            <strong>Inspect job state and open detail for logs, artifacts, or legacy apply actions.</strong>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Type</th>
                <th>Status</th>
                <th>Environment</th>
                <th className="jobs-col-optional">Updated</th>
                <th className="jobs-col-optional">Error</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>{j.id.slice(0, 8)}</strong>
                    <span className="muted">{j.source_job_id ? `source ${j.source_job_id.slice(0, 8)}` : 'plan source'}</span>
                  </td>
                  <td>
                    <span className="badge badge-muted">{j.type}</span>
                  </td>
                  <td>
                    <StatusBadge status={j.status} />
                  </td>
                  <td>
                    <strong>{j.environment?.environment_name || '-'}</strong>
                    <span className="muted">{j.environment?.tenant_name || '-'}</span>
                  </td>
                  <td className="jobs-col-optional">{j.updated_at ? new Date(j.updated_at).toLocaleString() : '-'}</td>
                  <td className="jobs-col-optional">
                    {j.error ? <span className="muted" style={{ color: 'var(--danger)' }}>{summarizeOperatorError(j.error)}</span> : <span className="muted">-</span>}
                  </td>
                  <td>
                    <Link to={`/jobs/${j.id}`} className="ghost" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="muted" style={{ padding: '1rem 0' }}>
                      No jobs yet.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
