import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, Environment, EnvironmentSpec, environments, TemplateDescriptor, templates, User } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import { useI18n } from '../i18n'
import StatusBadge from '../components/StatusBadge'
import { summarizeOperatorError } from '../utils/uiCopy'

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

function lastExecutionResult(item: Environment, ko: boolean): string {
  if (item.status === 'failed') return ko ? '실패' : 'failed'
  if (item.status === 'active' || item.status === 'destroyed') return ko ? '성공' : 'success'
  if (item.status === 'planning' || item.status === 'applying' || item.status === 'destroying') return ko ? '진행 중' : 'running'
  if (item.status === 'pending_approval' || item.status === 'approved') return ko ? '승인 대기' : 'waiting approval'
  return ko ? '대기' : 'queued'
}

export default function EnvironmentsPage() {
  const nav = useNavigate()
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
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
    const base = { total: items.length, pending: 0, failed: 0 }
    for (const item of items) {
      if (item.status === 'pending_approval') base.pending += 1
      if (item.status === 'failed') base.failed += 1
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

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{copy.environments.kicker}</div>
          <h1 className="page-title">{copy.environments.title}</h1>
          <p className="page-copy">{copy.environments.copy}</p>
          <div className="row-meta" style={{ marginTop: 12 }}>
            {copy.environments.viewer} {viewer?.email || (ko ? '불러오는 중...' : 'loading...')}
          </div>
        </div>
        <div className="hero-actions">
          <Link to="/create-environment" className="action-link action-link-button">
            {copy.environments.openWizard}
          </Link>
          <button className="ghost" onClick={load}>
            {copy.environments.refresh}
          </button>
          <button className="ghost" onClick={() => setShowCreate((current) => !current)}>
            {showCreate ? copy.environments.hideQuickCreate : copy.environments.quickCreate}
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>{ko ? '환경 수' : 'Environments'}</span>
          <strong>{summary.total}</strong>
          <p>{ko ? '현재 운영 콘솔이 추적 중인 전체 환경 수입니다.' : 'Total environments currently tracked in the control plane.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '승인 대기' : 'Pending approval'}</span>
          <strong>{summary.pending}</strong>
          <p>{ko ? '운영 승인 게이트 때문에 apply 전에 멈춰 있는 계획입니다.' : 'Plans blocked before apply due to operator approval gates.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '실패 실행' : 'Failed executions'}</span>
          <strong>{summary.failed}</strong>
          <p>{ko ? '플랜 또는 적용 실패로 조사/재시도가 필요한 환경입니다.' : 'Environments requiring investigation or retry after failure.'}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '필터' : 'Filters'}</div>
              <h2>{ko ? '환경 상태 검색' : 'Search environment state'}</h2>
            </div>
          </div>
          <div className="toolbar-row">
            <input
              className="ops-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={ko ? '환경, 테넌트, 소유자, 라이프사이클 검색' : 'Search environment, tenant, owner, or lifecycle'}
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}>
              <option value="all">{ko ? '전체 상태' : 'All statuses'}</option>
              <option value="pending_approval">{ko ? '승인 대기' : 'Pending approval'}</option>
              <option value="active">{ko ? '활성' : 'Active'}</option>
              <option value="failed">{ko ? '실패' : 'Failed'}</option>
              <option value="planning">{ko ? '계획 중' : 'Planning'}</option>
              <option value="applying">{ko ? '적용 중' : 'Applying'}</option>
            </select>
          </div>
          <div className="table-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{ko ? '환경' : 'Environment'}</th>
                  <th>{ko ? '라이프사이클' : 'Lifecycle'}</th>
                  <th>{ko ? '최근 실행' : 'Last execution'}</th>
                  <th>{ko ? '다음 단계' : 'Next step'}</th>
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
                      <strong>{lastExecutionResult(env, ko)}</strong>
                      <div className="row-meta">
                        {env.last_job_id ? (
                          <Link to={`/jobs/${env.last_job_id}`} className="text-link">
                            {env.last_job_id.slice(0, 8)}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </div>
                    </td>
                    <td>
                      <Link to={primaryRoute(env)} className="text-link">
                        {env.status === 'pending_approval'
                          ? ko ? '계획 검토' : 'Review plan'
                          : env.approval_status === 'approved'
                            ? ko ? '승인 제어' : 'Approval control'
                            : ko ? '환경 상세' : 'Environment detail'}
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">{ko ? '현재 필터와 일치하는 환경이 없습니다.' : 'No environments match the current filters.'}</div>
                  </td>
                </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {showCreate ? (
        <section className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '빠른 생성' : 'Quick create'}</div>
              <h2>{ko ? '새 환경의 초기 계획 큐잉' : 'Queue the initial plan for a new environment'}</h2>
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
                setCreateError(err?.message || (ko ? '환경 생성 실패' : 'failed to create environment'))
              } finally {
                setCreating(false)
              }
            }}
          >
            <label className="field">
              <span>{ko ? '템플릿' : 'Template'}</span>
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
            {createError ? <div className="error-box">{summarizeOperatorError(createError)}</div> : null}
            <div className="detail-actions">
              <button type="submit" disabled={creating}>
                {creating ? (ko ? '초기 계획 큐잉 중...' : 'Queueing initial plan...') : ko ? '환경 생성' : 'Create environment'}
              </button>
              <button type="button" className="ghost" onClick={() => setSpec(createDefaultSpec())} disabled={creating}>
                {ko ? '초기화' : 'Reset'}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  )
}
