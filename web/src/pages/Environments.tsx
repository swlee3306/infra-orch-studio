import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, Environment, EnvironmentSpec, environments, User } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import StatusBadge from '../components/StatusBadge'

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

export default function EnvironmentsPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<Environment[]>([])
  const [viewer, setViewer] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [spec, setSpec] = useState<EnvironmentSpec>(createDefaultSpec)

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
      const res = await environments.list(50)
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
          if (item.status === 'pending_approval') acc.pending += 1
          else if (item.status === 'applying' || item.status === 'planning') acc.inflight += 1
          else if (item.status === 'active') acc.active += 1
          else if (item.status === 'failed') acc.failed += 1
          return acc
        },
        { total: 0, pending: 0, inflight: 0, active: 0, failed: 0 },
      ),
    [items],
  )

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="shell">
      <div className="grid">
        <section className="panel hero">
          <div className="hero-copy">
            <p className="muted" style={{ marginTop: 0 }}>
              Environment control plane
            </p>
            <h2>Create, review, approve, apply, and operate environments as durable resources.</h2>
            <p className="helper">
              Each environment now owns its lifecycle, approval state, artifacts, retry budget, and execution history.
            </p>
            <div className="detail-actions">
              <button onClick={load}>Refresh</button>
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
              <span>Pending approval</span>
              <strong>{counts.pending}</strong>
            </div>
            <div className="meta-item">
              <span>In flight</span>
              <strong>{counts.inflight}</strong>
            </div>
            <div className="meta-item">
              <span>Active / Failed</span>
              <strong>
                {counts.active} / {counts.failed}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="detail-top" style={{ marginBottom: 12 }}>
            <div>
              <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                New environment
              </p>
              <strong>Create an environment and queue its initial plan.</strong>
            </div>
            <span className="badge badge-muted">Template: basic</span>
          </div>

          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault()
              setCreateError(null)
              setCreating(true)
              try {
                const created = await environments.create(spec, 'basic')
                nav(`/environments/${created.environment.id}`)
              } catch (err: any) {
                setCreateError(err?.message || 'failed to create environment')
              } finally {
                setCreating(false)
              }
            }}
          >
            <EnvironmentSpecForm value={spec} onChange={setSpec} />
            {createError ? <div className="error-box">{createError}</div> : null}
            <div className="detail-actions">
              <button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create environment'}
              </button>
              <button type="button" className="ghost" onClick={() => setSpec(createDefaultSpec())} disabled={creating}>
                Reset
              </button>
            </div>
          </form>
        </section>
      </div>

      {error ? (
        <section className="panel error-box" style={{ marginTop: 18 }}>
          {error}
        </section>
      ) : null}

      <section className="panel">
        <div className="detail-top" style={{ marginBottom: 12 }}>
          <div>
            <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
              Environments
            </p>
            <strong>Operate environments directly, then drill into jobs only when execution detail is needed.</strong>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="jobs-table">
            <thead>
              <tr>
                <th>Environment</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Operation</th>
                <th>Last job</th>
                <th>Retries</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((env) => (
                <tr key={env.id}>
                  <td>
                    <strong>{env.name}</strong>
                    <span className="muted">{env.spec?.tenant_name || '-'}</span>
                  </td>
                  <td>
                    <StatusBadge status={env.status} />
                  </td>
                  <td>
                    <StatusBadge status={env.approval_status} />
                  </td>
                  <td>
                    <span className="badge badge-muted">{env.operation || '-'}</span>
                  </td>
                  <td>
                    {env.last_job_id ? (
                      <Link to={`/jobs/${env.last_job_id}`}>{env.last_job_id.slice(0, 8)}</Link>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>
                    {env.retry_count || 0} / {env.max_retries || 0}
                  </td>
                  <td>{env.updated_at ? new Date(env.updated_at).toLocaleString() : '-'}</td>
                  <td>
                    <Link
                      to={`/environments/${env.id}`}
                      className="ghost"
                      style={{ textDecoration: 'none', display: 'inline-flex' }}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="muted" style={{ padding: '1rem 0' }}>
                      No environments yet.
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
