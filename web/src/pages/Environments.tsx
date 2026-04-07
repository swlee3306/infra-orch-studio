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
      { label: ko ? '요청' : 'Request', value: summary.total },
      { label: ko ? '계획' : 'Plan', value: items.filter((item) => item.status === 'planning').length },
      { label: ko ? '승인' : 'Approval', value: summary.pending },
      { label: ko ? '적용' : 'Apply', value: items.filter((item) => item.status === 'applying').length },
      { label: ko ? '결과' : 'Result', value: summary.active },
    ],
    [items, ko, summary],
  )

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{copy.environments.kicker}</div>
          <h1 className="page-title">{copy.environments.title}</h1>
          <p className="page-copy">{copy.environments.copy}</p>
          <div className="row-meta" style={{ marginTop: 12 }}>
            {copy.environments.viewer} {viewer?.email || 'loading...'}
          </div>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
            {copy.environments.refresh}
          </button>
          <Link to="/create-environment" className="ghost action-link action-link-button">
            {copy.environments.openWizard}
          </Link>
          <button className="ghost" onClick={() => setShowCreate((current) => !current)}>{showCreate ? copy.environments.hideQuickCreate : copy.environments.quickCreate}</button>
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
          <span>{ko ? '진행 중' : 'In flight'}</span>
          <strong>{summary.inflight}</strong>
          <p>{ko ? '현재 시스템에서 실행 중인 환경 plan 또는 apply 작업입니다.' : 'Environment plans or applies currently running through the system.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '정상 / 실패' : 'Active / failed'}</span>
          <strong>
            {summary.active} / {summary.failed}
          </strong>
          <p>{ko ? '정상 상태의 환경과 실행 실패로 멈춘 환경의 비율입니다.' : 'Healthy results versus environments paused on execution failure.'}</p>
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
            <div className="chip-row">
              {[
                ['all', ko ? '전체' : 'All'],
                ['pending_approval', ko ? '승인 대기' : 'Pending approval'],
                ['active', ko ? '활성' : 'Active'],
                ['failed', ko ? '실패' : 'Failed'],
                ['planning', ko ? '계획 중' : 'Planning'],
                ['applying', ko ? '적용 중' : 'Applying'],
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
                  <th>{ko ? '환경' : 'Environment'}</th>
                  <th>{ko ? '라이프사이클' : 'Lifecycle'}</th>
                  <th>{ko ? '승인' : 'Approval'}</th>
                  <th className="ops-col-optional">{ko ? '작업' : 'Operation'}</th>
                  <th className="ops-col-optional">{ko ? '소유자' : 'Owner'}</th>
                  <th>{ko ? '최근 실행' : 'Last execution'}</th>
                  <th className="ops-col-optional">{ko ? '재시도' : 'Retries'}</th>
                  <th className="ops-col-optional">{ko ? '업데이트' : 'Updated'}</th>
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
                      <StatusBadge status={env.approval_status} />
                    </td>
                    <td className="ops-col-optional">{env.operation || '-'}</td>
                    <td className="ops-col-optional">{env.created_by_email || '-'}</td>
                    <td>
                      {env.last_job_id ? (
                        <Link to={`/jobs/${env.last_job_id}`} className="text-link">
                          {env.last_job_id.slice(0, 8)}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="ops-col-optional">
                      {env.retry_count || 0} / {env.max_retries || 0}
                    </td>
                    <td className="ops-col-optional">{env.updated_at ? new Date(env.updated_at).toLocaleString() : '-'}</td>
                    <td>
                      <Link to={primaryRoute(env)} className="text-link">
                        {env.status === 'pending_approval'
                          ? ko ? '계획 검토' : 'Review plan'
                          : env.approval_status === 'approved'
                            ? ko ? '적용 제어' : 'Control apply'
                            : ko ? '상세 보기' : 'Open detail'}
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">{ko ? '현재 필터와 일치하는 환경이 없습니다.' : 'No environments match the current filters.'}</div>
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
              <div className="section-kicker">{ko ? '라이프사이클' : 'Lifecycle'}</div>
              <h2>{ko ? '단계 가시성' : 'Stage visibility'}</h2>
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
            <strong>{ko ? '환경 중심 목록' : 'Environment-first list'}</strong>
            <p>{ko ? '작업 기록은 실행 링크로 계속 확인할 수 있지만, 목록 필터링은 환경 라이프사이클과 승인 상태를 기준으로 동작합니다.' : 'Job records remain visible through the execution links, but list filtering is anchored on environment lifecycle and approval state.'}</p>
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
                setCreateError(err?.message || 'failed to create environment')
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
