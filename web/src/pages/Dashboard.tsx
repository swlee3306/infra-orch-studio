import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, environments, Environment, User } from '../api'
import StatusBadge from '../components/StatusBadge'
import { useI18n } from '../i18n'
import { formatDateTime } from '../utils/format'
import { summarizeOperatorError } from '../utils/uiCopy'

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
      reviewReady: 0,
      approvedWaitingApply: 0,
      failed: 0,
    }
    for (const item of items) {
      if (item.status === 'active') base.active += 1
      if (item.status === 'pending_approval') base.reviewReady += 1
      if (item.status === 'approved' && item.approval_status === 'approved') base.approvedWaitingApply += 1
      if (item.status === 'failed') base.failed += 1
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
            {copy.dashboard.viewer} {viewer?.email || (ko ? '불러오는 중...' : 'loading...')} · {viewer?.is_admin ? (ko ? '관리자' : 'admin') : ko ? '운영자' : 'operator'}
          </div>
        </div>
        <div className="hero-actions">
          <Link to="/create-environment" className="action-link action-link-button">
            {ko ? '환경 만들기' : 'Create environment'}
          </Link>
          <button className="ghost" onClick={load}>{copy.dashboard.refresh}</button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>{ko ? '검토 대기' : 'Review queue'}</span>
          <strong>{summary.reviewReady}</strong>
          <p>{ko ? '플랜 검토가 필요한 환경 수입니다.' : 'Environments waiting for plan review and approval.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '승인 완료 / 적용 대기' : 'Approved waiting apply'}</span>
          <strong>{summary.approvedWaitingApply}</strong>
          <p>{ko ? '승인 게이트는 통과했지만 적용 큐잉이 남은 환경입니다.' : 'Approved environments that still need apply to be queued.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '실패 실행' : 'Failed executions'}</span>
          <strong>{summary.failed}</strong>
          <p>{ko ? '플랜 또는 적용 단계 실패로 멈춘 환경 수입니다.' : 'Environments paused on a failed plan or apply step.'}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '승인' : 'Approvals'}</div>
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
              <div className="section-kicker">{ko ? '실패' : 'Failures'}</div>
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

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">{ko ? '환경 목록' : 'Environment list'}</div>
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
                <th>{ko ? '수정 시각' : 'Updated'}</th>
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
                  <td>{formatDateTime(item.updated_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
