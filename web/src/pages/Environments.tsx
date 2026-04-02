import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, Environment, EnvironmentSpec, environments, TemplateDescriptor, templates, User } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import StatusBadge from '../components/StatusBadge'

type FilterKey = 'all' | 'pending_approval' | 'active' | 'failed' | 'planning' | 'applying'

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

function matchesFilter(item: Environment, filter: FilterKey): boolean {
  return filter === 'all' ? true : item.status === filter
}

function primaryRoute(item: Environment): string {
  if (item.status === 'pending_approval') return `/environments/${item.id}/review`
  if (item.approval_status === 'approved') return `/environments/${item.id}/approval`
  return `/environments/${item.id}`
}

export default function EnvironmentsPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<Environment[]>([])
  const [viewer, setViewer] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [spec, setSpec] = useState<EnvironmentSpec>(createDefaultSpec)
  const [templateItems, setTemplateItems] = useState<TemplateDescriptor[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('basic')

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
      const environmentRes = await environments.list(100)
      setItems(environmentRes.items)
      setViewer(environmentRes.viewer)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    templates
      .list()
      .then((templateRes) => {
        setTemplateItems(templateRes.environment_sets)
        if (templateRes.environment_sets.length > 0) {
          setSelectedTemplate((current) =>
            templateRes.environment_sets.some((item) => item.name === current) ? current : templateRes.environment_sets[0].name,
          )
        }
      })
      .catch(() => {
        setTemplateItems([])
        setSelectedTemplate('basic')
      })
  }, [])

  const summary = useMemo(() => {
    const base = { total: items.length, active: 0, pending: 0, failed: 0, inflight: 0 }
    for (const item of items) {
      if (item.status === 'active') base.active += 1
      if (item.status === 'pending_approval') base.pending += 1
      if (item.status === 'failed') base.failed += 1
      if (item.status === 'planning' || item.status === 'applying') base.inflight += 1
    }
    return base
  }, [items])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      if (!matchesFilter(item, filter)) return false
      if (!query) return true
      const haystack = [
        item.name,
        item.spec.tenant_name,
        item.created_by_email,
        item.status,
        item.approval_status,
        item.operation,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [filter, items, search])

  const lifecycleBuckets = useMemo(
    () => [
      { label: 'Request', value: summary.total },
      { label: 'Plan', value: items.filter((item) => item.status === 'planning').length },
      { label: 'Approval', value: summary.pending },
      { label: 'Apply', value: items.filter((item) => item.status === 'applying').length },
      { label: 'Result', value: summary.active },
    ],
    [items, summary],
  )

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">Environment list</div>
          <h1 className="page-title">Track health, approvals, and orchestration readiness.</h1>
          <p className="page-copy">
            The environment is the primary product object. Use this surface to filter lifecycle posture, then open detail for guarded actions.
          </p>
        </div>
        <div className="hero-actions">
          <span className="badge badge-muted">Viewer: {viewer?.email || 'loading...'}</span>
          <button className="ghost" onClick={load}>
            Refresh
          </button>
          <Link to="/create-environment" className="ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
            Open wizard
          </Link>
          <button onClick={() => setShowCreate((current) => !current)}>{showCreate ? 'Hide quick create' : 'Quick create'}</button>
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>Environments</span>
          <strong>{summary.total}</strong>
          <p>Total environments currently tracked in the control plane.</p>
        </article>
        <article className="metric-card">
          <span>Pending approval</span>
          <strong>{summary.pending}</strong>
          <p>Plans blocked before apply due to operator approval gates.</p>
        </article>
        <article className="metric-card">
          <span>In flight</span>
          <strong>{summary.inflight}</strong>
          <p>Environment plans or applies currently running through the system.</p>
        </article>
        <article className="metric-card">
          <span>Active / failed</span>
          <strong>
            {summary.active} / {summary.failed}
          </strong>
          <p>Healthy results versus environments paused on execution failure.</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">Filters</div>
              <h2>Search environment state</h2>
            </div>
          </div>
          <div className="toolbar-row">
            <input
              className="ops-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search environment, tenant, owner, or lifecycle"
            />
            <div className="chip-row">
              {[
                ['all', 'All'],
                ['pending_approval', 'Pending approval'],
                ['active', 'Active'],
                ['failed', 'Failed'],
                ['planning', 'Planning'],
                ['applying', 'Applying'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`filter-chip ${filter === value ? 'filter-chip-active' : ''}`}
                  onClick={() => setFilter(value as FilterKey)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="table-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Environment</th>
                  <th>Lifecycle</th>
                  <th>Approval</th>
                  <th>Operation</th>
                  <th>Owner</th>
                  <th>Last execution</th>
                  <th>Retries</th>
                  <th>Updated</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((env) => (
                  <tr key={env.id}>
                    <td>
                      <Link to={primaryRoute(env)} className="text-link">
                        {env.name}
                      </Link>
                      <div className="row-meta">{env.spec?.tenant_name || '-'}</div>
                    </td>
                    <td>
                      <StatusBadge status={env.status} />
                    </td>
                    <td>
                      <StatusBadge status={env.approval_status} />
                    </td>
                    <td>{env.operation || '-'}</td>
                    <td>{env.created_by_email || '-'}</td>
                    <td>
                      {env.last_job_id ? (
                        <Link to={`/jobs/${env.last_job_id}`} className="text-link">
                          {env.last_job_id.slice(0, 8)}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      {env.retry_count || 0} / {env.max_retries || 0}
                    </td>
                    <td>{env.updated_at ? new Date(env.updated_at).toLocaleString() : '-'}</td>
                    <td>
                      <Link to={primaryRoute(env)} className="text-link">
                        {env.status === 'pending_approval'
                          ? 'Review plan'
                          : env.approval_status === 'approved'
                            ? 'Control apply'
                            : 'Open detail'}
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">No environments match the current filters.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Lifecycle</div>
              <h2>Stage visibility</h2>
            </div>
          </div>
          <div className="lifecycle-strip lifecycle-strip-vertical">
            {lifecycleBuckets.map((bucket) => (
              <div key={bucket.label} className="lifecycle-step">
                <span>{bucket.label}</span>
                <strong>{bucket.value}</strong>
              </div>
            ))}
          </div>
          <div className="note-card">
            <strong>Environment-first list</strong>
            <p>Job records remain visible through the execution links, but list filtering is anchored on environment lifecycle and approval state.</p>
          </div>
        </article>
      </section>

      {showCreate ? (
        <section className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Quick create</div>
              <h2>Queue the initial plan for a new environment</h2>
            </div>
          </div>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault()
              setCreateError(null)
              setCreating(true)
              try {
                const created = await environments.create(spec, selectedTemplate)
                nav(`/environments/${created.environment.id}/review`)
              } catch (err: any) {
                setCreateError(err?.message || 'failed to create environment')
              } finally {
                setCreating(false)
              }
            }}
          >
            <label className="field">
              <span>Template</span>
              <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
                {templateItems.length === 0 ? <option value="basic">basic</option> : null}
                {templateItems.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <EnvironmentSpecForm value={spec} onChange={setSpec} />
            {createError ? <div className="error-box">{createError}</div> : null}
            <div className="detail-actions">
              <button type="submit" disabled={creating}>
                {creating ? 'Queueing initial plan...' : 'Create environment'}
              </button>
              <button type="button" className="ghost" onClick={() => setSpec(createDefaultSpec())} disabled={creating}>
                Reset
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  )
}
