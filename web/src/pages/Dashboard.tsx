import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, environments, Environment, User } from '../api'
import StatusBadge from '../components/StatusBadge'
import { useI18n } from '../i18n'
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
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
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
          <div className="page-kicker">{copy.dashboard.kicker}</div>
          <h1 className="page-title">{copy.dashboard.title}</h1>
          <p className="page-copy">{copy.dashboard.copy}</p>
          <div className="row-meta" style={{ marginTop: 12 }}>
            {copy.dashboard.viewer} {viewer?.email || 'loading...'} · {viewer?.is_admin ? 'admin' : 'operator'}
          </div>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>{copy.dashboard.refresh}</button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>{ko ? '활성 환경' : 'Active environments'}</span>
          <strong>{summary.active}</strong>
          <p>{ko ? '적용이 성공적으로 끝나 현재 운영 중인 환경입니다.' : 'Environments currently running after a successful apply.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '승인 대기' : 'Pending approvals'}</span>
          <strong>{summary.pending}</strong>
          <p>{ko ? '적용 전에 승인이 필요해 멈춰 있는 플랜 수입니다.' : 'Plans blocked at approval before apply can be queued.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '실패 실행' : 'Failed executions'}</span>
          <strong>{summary.failed}</strong>
          <p>{ko ? '플랜 또는 적용 단계 실패로 멈춘 환경 수입니다.' : 'Environments paused on a failed plan or apply step.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '진행 중' : 'In flight'}</span>
          <strong>{summary.planning + summary.applying}</strong>
          <p>{ko ? '현재 러너에서 처리 중인 플랜과 적용 작업입니다.' : 'Plans and applies currently moving through the runner.'}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Approvals</div>
              <h2>{ko ? '승인 필요' : 'Approval required'}</h2>
            </div>
            <Link to="/environments" className="text-link">
              {ko ? '전체 보기' : 'View all'}
            </Link>
          </div>
          <div className="stack-list">
            {pendingApprovals.length === 0 ? (
              <div className="empty-state">{ko ? '승인을 기다리는 플랜이 없습니다.' : 'No plans are waiting for approval.'}</div>
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
              <h2>{ko ? '실패 환경' : 'Failed environments'}</h2>
            </div>
            <Link to="/jobs" className="text-link">
              {ko ? '실행 이력 열기' : 'Open executions'}
            </Link>
          </div>
          <div className="stack-list">
            {incidents.length === 0 ? (
              <div className="empty-state">{ko ? '현재 스냅샷에는 실패한 환경이 없습니다.' : 'No failed environments in the current snapshot.'}</div>
            ) : (
              incidents.map((item) => (
                <Link key={item.id} to={`/environments/${item.id}`} className="stack-row stack-row-link">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="row-meta">{summarizeOperatorError(item.last_error || (ko ? '실행이 실패했습니다. 상세 화면을 확인하세요.' : 'Execution failed. Review detail.'))}</div>
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
              <h2>{ko ? '최근 생명주기 이력' : 'Recent lifecycle records'}</h2>
            </div>
            <Link to="/environments" className="text-link">
              {ko ? '환경 목록 열기' : 'Open environment list'}
            </Link>
          </div>
          <div className="table-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{ko ? '환경' : 'Environment'}</th>
                  <th>{ko ? '생명주기' : 'Lifecycle'}</th>
                  <th>{ko ? '승인' : 'Approval'}</th>
                  <th className="dashboard-col-mobile-optional">{ko ? '소유자' : 'Owner'}</th>
                  <th className="dashboard-col-mobile-optional">{ko ? '수정 시각' : 'Updated'}</th>
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
                    <td className="dashboard-col-mobile-optional">{item.created_by_email || '-'}</td>
                    <td className="dashboard-col-mobile-optional">{formatUpdated(item.updated_at)}</td>
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
              <h2>{ko ? '환경 생명주기 제어' : 'Environment lifecycle control'}</h2>
            </div>
          </div>
          <div className="lifecycle-strip">
            <div className="lifecycle-step">
              <span>{ko ? '01 요청' : '01 Request'}</span>
              <strong>{summary.total}</strong>
            </div>
            <div className="lifecycle-step">
              <span>{ko ? '02 플랜' : '02 Plan'}</span>
              <strong>{summary.planning}</strong>
            </div>
            <div className="lifecycle-step">
              <span>{ko ? '03 승인' : '03 Approval'}</span>
              <strong>{summary.pending}</strong>
            </div>
            <div className="lifecycle-step">
              <span>{ko ? '04 적용' : '04 Apply'}</span>
              <strong>{summary.applying}</strong>
            </div>
            <div className="lifecycle-step">
              <span>{ko ? '05 결과' : '05 Result'}</span>
              <strong>{summary.active}</strong>
            </div>
          </div>
          <div className="note-card">
            <strong>{ko ? '환경 중심 운영' : 'Environment-first posture'}</strong>
            <p>
              {ko
                ? '작업 이력은 실행 기록으로 계속 보이지만, 운영자는 환경 객체에서 시작하고 필요할 때만 상세 실행으로 내려가야 합니다.'
                : 'Jobs remain visible as execution records, but operators should start from the environment object and only drill down when a run needs inspection.'}
            </p>
          </div>
        </article>
      </section>
    </div>
  )
}
