import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuditEvent, auth, Environment, environments, Job, ImpactSummary, ReviewSignal } from '../api'
import { formatStatusLabel } from '../components/StatusBadge'
import { useI18n } from '../i18n'
import { latestApprovalEvent } from '../utils/environmentView'

function displayReviewSignal(signal: ReviewSignal, ko: boolean): ReviewSignal {
  if (!ko) return signal
  const labelMap: Record<string, string> = {
    'Destroy operation': '삭제 작업',
    'Large instance footprint': '큰 인스턴스 규모',
    'Subnet capacity pressure': '서브넷 용량 압박',
    'Security references missing': '보안 참조 누락',
    'Security references inherited': '보안 참조 상속',
    'Template-backed plan': '템플릿 기반 계획',
  }
  return {
    ...signal,
    label: labelMap[signal.label] || signal.label,
    detail: signal.detail
      .replace('This plan is destructive and will require an explicit confirmation before it should be approved.', '이 계획은 파괴적 작업이며 승인 전에 명시적 확인이 필요합니다.')
      .replace('No security groups are attached. Validate tenant baseline inheritance before apply.', '보안 그룹이 연결되어 있지 않습니다. apply 전에 테넌트 기본 상속을 확인하세요.')
      .replace(' will be included in the resulting environment state.', ' 항목이 결과 환경 상태에 포함됩니다.')
      .replace(' will be rendered through the fixed template path.', ' 구성이 고정 템플릿 경로로 렌더링됩니다.')
      .replace('Network ', '네트워크 ')
      .replace(' and subnet ', ' / 서브넷 '),
  }
}

export default function PlanReviewPage() {
  const nav = useNavigate()
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
  const { id } = useParams()
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [auditItems, setAuditItems] = useState<AuditEvent[]>([])
  const [planJob, setPlanJob] = useState<Job | null>(null)
  const [reviewSignals, setReviewSignals] = useState<ReviewSignal[]>([])
  const [impact, setImpact] = useState<ImpactSummary | null>(null)
  const [ack, setAck] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const environmentId = id || ''

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
      const [env, audit, review] = await Promise.all([
        environments.get(environmentId),
        environments.audit(environmentId),
        environments.planReview(environmentId),
      ])
      setEnvironment(env)
      setAuditItems(audit.items)
      setPlanJob(review.plan_job || null)
      setReviewSignals(review.review_signals)
      setImpact(review.impact_summary)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    load()
  }, [environmentId])

  const approvalEvent = useMemo(() => latestApprovalEvent(auditItems), [auditItems])

  async function run(action: string, fn: () => Promise<any>) {
    setBusy(action)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err: any) {
      setError(err?.message || 'failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">
            <Link to="/environments" className="text-link">
              Environments
            </Link>{' '}
            / {copy.review.kicker}
          </div>
          <h1 className="page-title">{copy.review.title}</h1>
          <p className="page-copy">{copy.review.copy}</p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
            {copy.review.refresh}
          </button>
          {environment ? (
            <Link to={`/environments/${environment.id}/approval`} className="ghost action-link action-link-button">
              {copy.review.approvalControl}
            </Link>
          ) : null}
          {environment ? (
            <Link to={`/environments/${environment.id}`} className="ghost action-link action-link-button">
              {copy.review.environmentDetail}
            </Link>
          ) : null}
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>{ko ? '계획 상태' : 'Plan status'}</span>
          <strong>{planJob?.status ? formatStatusLabel(planJob.status, ko) : ko ? '없음' : 'missing'}</strong>
          <p>{ko ? '이 환경의 최신 계획 작업 상태입니다.' : 'Current status of the latest queued plan job for this environment.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '고위험' : 'High-risk'}</span>
          <strong>{reviewSignals.filter((item) => item.severity === 'high').length}</strong>
          <p>{ko ? '운영자의 신중한 검토가 필요한 추론된 변경 수입니다.' : 'Inferred changes that require deliberate operator review.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '낮음 / 중간' : 'Low / medium'}</span>
          <strong>{reviewSignals.filter((item) => item.severity !== 'high').length}</strong>
          <p>{ko ? '현재 목표 상태에 연결된 참고 또는 주의 수준 변경입니다.' : 'Informational or cautionary changes associated with this desired state.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '승인' : 'Approval'}</span>
          <strong>{environment?.approval_status ? formatStatusLabel(environment.approval_status, ko) : '-'}</strong>
          <p>{ko ? '환경 리소스에 기록된 승인 상태입니다.' : 'Approval state tracked on the environment resource.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '템플릿' : 'Template'}</span>
          <strong>{planJob?.template_name || 'basic'}</strong>
          <p>{ko ? '현재 계획 산출물을 렌더링한 템플릿 세트입니다.' : 'Template set used to render the current plan artifact.'}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '계획 검토' : 'Plan review'}</div>
              <h2>{ko ? '낮은 위험과 높은 위험 신호' : 'Low-risk and high-risk signals'}</h2>
            </div>
          </div>
          <div className="stack-list">
            {reviewSignals.map((rawSignal) => {
              const signal = displayReviewSignal(rawSignal, ko)
              return <div key={signal.label} className={`stack-row ${signal.severity === 'high' ? 'stack-row-danger' : ''}`}>
                <div>
                  <strong>{signal.label}</strong>
                  <div className="row-meta">{signal.detail}</div>
                </div>
                <span className={`badge ${signal.severity === 'high' ? 'badge-failed' : signal.severity === 'medium' ? 'badge-queued' : 'badge-done'}`}>
                  {ko ? signal.severity === 'high' ? '높음' : signal.severity === 'medium' ? '중간' : '낮음' : signal.severity}
                </span>
              </div>
            })}
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '영향 요약' : 'Impact summary'}</div>
              <h2>{ko ? '운영 영향' : 'Operational posture'}</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>{ko ? '다운타임 위험' : 'Downtime risk'}</span>
              <strong>{impact?.downtime || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '영향 범위' : 'Blast radius'}</span>
              <strong>{impact?.blast_radius || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '자원 영향' : 'Footprint'}</span>
              <strong>{impact?.cost_delta || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '계획 산출물' : 'Plan artifact'}</span>
              <strong>{planJob?.plan_path || environment?.plan_path || '-'}</strong>
            </div>
          </div>
          <label className="checkbox" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{copy.review.ack}</span>
          </label>
          <label className="field" style={{ marginTop: 14 }}>
            <span>{copy.review.approvalComment}</span>
            <textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder={copy.review.approvalPlaceholder}
              rows={3}
            />
          </label>
          <div className="detail-actions" style={{ marginTop: 14 }}>
            {viewer?.is_admin && environment?.status === 'pending_approval' ? (
              <button onClick={() => run('approve', () => environments.approve(environmentId, { comment: approvalComment.trim(), expected_revision: environment?.revision }))} disabled={!ack || busy !== null}>
                {busy === 'approve' ? copy.review.approving : copy.review.approve}
              </button>
            ) : null}
            {viewer?.is_admin && environment?.approval_status === 'approved' ? (
              <button onClick={() => run('apply', () => environments.apply(environmentId, environment?.revision))} disabled={!ack || busy !== null}>
                {busy === 'apply' ? copy.review.applying : copy.review.apply}
              </button>
            ) : null}
            {environment?.approval_status === 'approved' ? (
              <Link to={`/environments/${environment.id}/approval`} className="ghost action-link action-link-button">
                {copy.review.openGuardedControl}
              </Link>
            ) : null}
          </div>
        </article>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">{ko ? '승인 제어' : 'Approval controls'}</div>
            <h2>{ko ? '검토 상태' : 'Review status'}</h2>
          </div>
        </div>
        <div className="info-grid info-grid-three">
          <div className="meta-item">
            <span>{ko ? '환경' : 'Environment'}</span>
            <strong>{environment?.name || '-'}</strong>
          </div>
          <div className="meta-item">
            <span>{ko ? '계획 작업' : 'Plan job'}</span>
            <strong>{planJob?.id ? planJob.id.slice(0, 8) : '-'}</strong>
          </div>
          <div className="meta-item">
            <span>{ko ? '최근 승인 이벤트' : 'Last approval event'}</span>
            <strong>{approvalEvent ? new Date(approvalEvent.created_at).toLocaleString() : ko ? '아직 승인되지 않음' : 'Not yet approved'}</strong>
          </div>
        </div>
      </section>
    </div>
  )
}
