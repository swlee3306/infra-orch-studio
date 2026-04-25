import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, EnvironmentSpec, jobs, Job, User } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import StatusBadge from '../components/StatusBadge'
import { useI18n } from '../i18n'
import { formatDateTime } from '../utils/format'
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
  const { locale } = useI18n()
  const ko = locale === 'ko'
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
              {ko ? '실행 작업 공간' : 'Execution workspace'}
            </p>
            <h2>{ko ? '환경 워크플로가 큐잉한 원시 작업 실행을 확인합니다.' : 'Inspect raw job execution after the environment workflow has queued work.'}</h2>
            <p className="helper">
              {ko ? '환경 라이프사이클 작업은 환경 화면에서 시작해야 합니다. 이 페이지는 작업, 로그, plan/apply 파생 기록을 보는 하위 실행 ledger입니다.' : 'Environment lifecycle actions should start from the environments screen. This page is the lower-level execution ledger for jobs, logs, and derived plan/apply records.'}
            </p>
            <div className="detail-actions">
              <button className="ghost" onClick={load}>{ko ? '새로고침' : 'Refresh'}</button>
              <span className="badge badge-muted">{ko ? '뷰어' : 'Viewer'}: {viewer ? viewer.email : ko ? '불러오는 중...' : 'loading...'}</span>
              {viewer?.is_admin ? (
                <span className="badge badge-running">{ko ? '관리자' : 'admin'}</span>
              ) : (
                <span className="badge badge-muted">{ko ? '운영자' : 'operator'}</span>
              )}
            </div>
          </div>

          <div className="grid-two">
            <div className="meta-item">
              <span>{ko ? '전체' : 'Total'}</span>
              <strong>{counts.total}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '실행 중' : 'Running'}</span>
              <strong>{counts.running}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '대기' : 'Queued'}</span>
              <strong>{counts.queued}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '실패' : 'Failed'}</span>
              <strong>{counts.failed}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="detail-top" style={{ marginBottom: 12 }}>
            <div>
              <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                {ko ? '레거시 계획 요청' : 'Legacy plan request'}
              </p>
              <strong>{ko ? '1급 환경 aggregate 없이 원시 plan 작업을 생성합니다.' : 'Create a raw plan job without a first-class environment aggregate.'}</strong>
            </div>
            <div className="detail-actions">
              <span className="badge badge-muted">{ko ? '고급' : 'Advanced'}</span>
              <button type="button" className="ghost" onClick={() => setShowLegacyForm((current) => !current)}>
                {showLegacyForm ? (ko ? '레거시 폼 숨기기' : 'Hide legacy form') : ko ? '레거시 폼 열기' : 'Open legacy form'}
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
                  setCreateError(err?.message || (ko ? '계획 생성 실패' : 'failed to create plan'))
                } finally {
                  setCreating(false)
                }
              }}
            >
              <EnvironmentSpecForm value={spec} onChange={setSpec} />
              {createError ? <div className="error-box">{summarizeOperatorError(createError)}</div> : null}
              <div className="detail-actions">
                <button type="submit" disabled={creating}>
                  {creating ? (ko ? '생성 중...' : 'Creating...') : ko ? '계획 작업 생성' : 'Create plan job'}
                </button>
                <button type="button" className="ghost" onClick={() => setSpec(createDefaultSpec())} disabled={creating}>
                  {ko ? '초기화' : 'Reset'}
                </button>
              </div>
            </form>
          ) : (
            <div className="callout callout-info">
              <strong>{ko ? '레거시 실행 폼이 접혀 있습니다' : 'Legacy execution form is collapsed'}</strong>
              <p style={{ margin: '6px 0 0' }}>
                {ko ? '일반 운영은 환경 워크플로를 사용하세요. 이 폼은 진단이나 호환성 테스트를 위해 원시 실행 기록이 필요할 때만 엽니다.' : 'Use the environment workflow for normal operations. Open this form only when you need a raw execution record for diagnostics or compatibility testing.'}
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
                {ko ? '최근 실행' : 'Recent executions'}
              </p>
            <strong>{ko ? '작업 상태를 확인하고 로그, 산출물, 레거시 apply 작업을 위해 상세 화면을 엽니다.' : 'Inspect job state and open detail for logs, artifacts, or legacy apply actions.'}</strong>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="jobs-table">
            <thead>
              <tr>
                <th>{ko ? '작업' : 'Job'}</th>
                <th className="jobs-col-mobile-optional">{ko ? '유형' : 'Type'}</th>
                <th>{ko ? '상태' : 'Status'}</th>
                <th>{ko ? '환경' : 'Environment'}</th>
                <th className="jobs-col-optional">{ko ? '업데이트' : 'Updated'}</th>
                <th className="jobs-col-optional">{ko ? '오류' : 'Error'}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>{j.id.slice(0, 8)}</strong>
                    <span className="muted jobs-source-meta">{j.source_job_id ? `${ko ? '소스' : 'source'} ${j.source_job_id.slice(0, 8)}` : ko ? '계획 소스' : 'plan source'}</span>
                  </td>
                  <td className="jobs-col-mobile-optional">
                    <span className="badge badge-muted">{j.type}</span>
                  </td>
                  <td>
                    <StatusBadge status={j.status} />
                  </td>
                  <td>
                    <strong>{j.environment?.environment_name || '-'}</strong>
                    <span className="muted">{j.environment?.tenant_name || '-'}</span>
                  </td>
                  <td className="jobs-col-optional">{formatDateTime(j.updated_at, locale)}</td>
                  <td className="jobs-col-optional">
                    {j.error ? <span className="muted" style={{ color: 'var(--danger)' }}>{summarizeOperatorError(j.error)}</span> : <span className="muted">-</span>}
                  </td>
                  <td>
                    <Link to={`/jobs/${j.id}`} className="ghost jobs-detail-link" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                      {ko ? '열기' : 'Open'}
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="muted" style={{ padding: '1rem 0' }}>
                      {ko ? '아직 작업이 없습니다.' : 'No jobs yet.'}
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
