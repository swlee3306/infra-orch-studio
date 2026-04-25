import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuditEvent, auth, Environment, environments, Job } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatStatusLabel } from '../components/StatusBadge'
import { useI18n } from '../i18n'
import { buildApprovalCheckpoints, buildImpactSummary, findLatestPlanJob } from '../utils/environmentView'
import { formatDateTime } from '../utils/format'
import { displayAuditAction, isRevisionConflictError, summarizeAuditMessage, summarizeEnvironmentConflictDelta, summarizeOperatorError } from '../utils/uiCopy'

type ConfirmRequest = {
  title: string
  description: string
  confirmLabel: string
  tone: 'warning' | 'danger'
  details: Array<{ label: string; value: string }>
  execute: () => Promise<void>
}

export default function ApprovalControlPage() {
  const nav = useNavigate()
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
  const { id } = useParams()
  const environmentId = id || ''
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [jobsForEnvironment, setJobsForEnvironment] = useState<Job[]>([])
  const [auditItems, setAuditItems] = useState<AuditEvent[]>([])
  const [approvalComment, setApprovalComment] = useState('')
  const [typedConfirmation, setTypedConfirmation] = useState('')
  const [destroyComment, setDestroyComment] = useState('')
  const [showAudit, setShowAudit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflictHint, setConflictHint] = useState<string | null>(null)
  const [retryLabel, setRetryLabel] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const retryRef = useRef<null | (() => Promise<void>)>(null)

  async function load(): Promise<Environment | null> {
    setError(null)
    try {
      const me = await auth.me()
      setViewer(me)
    } catch {
      nav('/login')
      return null
    }
    try {
      const [env, audit, environmentJobs] = await Promise.all([
        environments.get(environmentId),
        environments.audit(environmentId),
        environments.jobs(environmentId),
      ])
      setEnvironment(env)
      setAuditItems(audit.items)
      setJobsForEnvironment(environmentJobs.items)
      return env
    } catch (err: any) {
      setError(err?.message || 'failed')
      return null
    }
  }

  useEffect(() => {
    load()
  }, [environmentId])

  const planJob = useMemo(() => findLatestPlanJob(environment, jobsForEnvironment), [environment, jobsForEnvironment])
  const typedConfirmationReady = typedConfirmation === (environment?.name || '')
  const checkpoints = useMemo(
    () => buildApprovalCheckpoints(environment, planJob, typedConfirmationReady, ko),
    [environment, ko, planJob, typedConfirmationReady],
  )
  const impact = useMemo(
    () =>
      buildImpactSummary(
        environment?.spec || { environment_name: '', tenant_name: '', network: { name: '', cidr: '' }, subnet: { name: '', cidr: '', enable_dhcp: true }, instances: [] },
        environment?.operation || 'update',
        ko,
      ),
    [environment, ko],
  )

  async function run(action: string, execute: (env: Environment | null) => Promise<any>) {
    setBusy(action)
    setError(null)
    setConflictHint(null)
    setRetryLabel(null)
    retryRef.current = null
    try {
      await execute(environment)
      await load()
    } catch (err: any) {
      const message = err?.message || 'failed'
      if (isRevisionConflictError(message)) {
        const previous = environment
        const refreshed = await load()
        setConflictHint(summarizeEnvironmentConflictDelta(previous, refreshed, ko))
      }
      setError(summarizeOperatorError(message))
      retryRef.current = async () => run(action, execute)
      setRetryLabel(action)
    } finally {
      setBusy(null)
    }
  }

  async function confirmPendingAction() {
    const current = confirmRequest
    if (!current) return
    await current.execute()
    setConfirmRequest(null)
  }

  const canApprove = Boolean(viewer?.is_admin && environment?.status === 'pending_approval')
  const canApply = Boolean(viewer?.is_admin && environment?.approval_status === 'approved')
  const canDestroy = Boolean(viewer?.is_admin && typedConfirmationReady && environment)

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">
            <Link to="/environments" className="text-link">
              {ko ? '환경' : 'Environments'}
            </Link>{' '}
            / {copy.approval.kicker}
          </div>
          <h1 className="page-title">{copy.approval.title}</h1>
          <p className="page-copy">{copy.approval.copy}</p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={() => { setConflictHint(null); void load() }}>
            {copy.approval.refresh}
          </button>
          {environment ? (
            <Link to={`/environments/${environment.id}/review`} className="ghost action-link action-link-button">
              {copy.approval.planReview}
            </Link>
          ) : null}
          {environment ? (
            <Link to={`/environments/${environment.id}`} className="ghost action-link action-link-button">
              {copy.approval.environmentDetail}
            </Link>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="error-box">
          <div>{error}</div>
          {retryRef.current ? (
            <div style={{ marginTop: 10 }}>
              <button className="ghost" onClick={() => void retryRef.current?.()} disabled={busy !== null}>
                {ko ? `마지막 작업 재시도${retryLabel ? ` (${retryLabel})` : ''}` : `Retry last action${retryLabel ? ` (${retryLabel})` : ''}`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {conflictHint ? (
        <section className="console-card">
          <div className="callout callout-warning">
            <strong>{ko ? '동시 변경 감지' : 'Concurrent change detected'}</strong>
            <p style={{ margin: '6px 0 0' }}>{conflictHint}</p>
          </div>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '승인 검토' : 'Approval review'}</div>
              <h2>{ko ? '제어 체크포인트' : 'Control checkpoint active'}</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>{ko ? '요청자' : 'Requester'}</span>
              <strong>{environment?.created_by_email || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '대상 환경' : 'Affected environment'}</span>
              <strong>{environment?.name || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '계획 요약' : 'Plan summary'}</span>
              <strong>{planJob?.type || 'tofu.plan'} / {planJob?.status ? formatStatusLabel(planJob.status, ko) : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '승인 상태' : 'Approval state'}</span>
              <strong>{environment?.approval_status ? formatStatusLabel(environment.approval_status, ko) : '-'}</strong>
            </div>
          </div>
          <div className="stack-list" style={{ marginTop: 14 }}>
            {checkpoints.map((item) => (
              <div key={item.label} className="stack-row">
                <div>
                  <strong>{item.label}</strong>
                </div>
                <span className={`badge ${item.state === 'ok' ? 'badge-done' : 'badge-queued'}`}>{ko ? item.state === 'ok' ? '정상' : '대기' : item.state}</span>
              </div>
            ))}
          </div>
          <label className="field" style={{ marginTop: 14 }}>
            <span>{copy.approval.approvalComment}</span>
            <textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder={copy.approval.approvalPlaceholder}
              rows={3}
            />
          </label>
          <div className="detail-actions" style={{ marginTop: 14 }}>
            {canApprove ? (
              <button onClick={() => run('approve', (env) => environments.approve(environmentId, { comment: approvalComment.trim(), expected_revision: env?.revision }))} disabled={busy !== null}>
                {busy === 'approve' ? copy.approval.approving : copy.approval.approveRequest}
              </button>
            ) : environment?.status === 'pending_approval' ? (
              <button className="ghost" disabled title={copy.approval.adminApproveOnly}>
                {copy.approval.approveRequest}
              </button>
            ) : null}
            {canApply ? (
              <button
                onClick={() =>
                  setConfirmRequest({
                    tone: 'warning',
                    title: ko ? '승인된 계획을 적용하시겠습니까?' : 'Queue Apply From Approved Plan?',
                    description: ko
                      ? 'apply는 승인된 계획 산출물을 기준으로 실제 OpenStack 변경을 큐잉합니다. 대상과 영향 범위를 다시 확인하세요.'
                      : 'Apply queues real OpenStack changes from the approved plan artifact. Confirm the target and impact before continuing.',
                    confirmLabel: busy === 'apply' ? copy.approval.applying : copy.approval.applyApproved,
                    details: [
                      { label: ko ? '환경' : 'Environment', value: environment?.name || environmentId },
                      { label: ko ? '작업' : 'Operation', value: environment?.operation || '-' },
                      { label: ko ? '계획 작업' : 'Plan job', value: planJob?.id?.slice(0, 8) || '-' },
                      { label: ko ? '영향 범위' : 'Blast radius', value: impact.blastRadius },
                    ],
                    execute: async () => run('apply', (env) => environments.apply(environmentId, env?.revision)),
                  })
                }
                disabled={busy !== null}
              >
                {busy === 'apply' ? copy.approval.applying : copy.approval.applyApproved}
              </button>
            ) : environment?.approval_status === 'approved' ? (
              <button className="ghost" disabled title={copy.approval.adminApplyOnly}>
                {copy.approval.applyApproved}
              </button>
            ) : null}
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '영향 미리보기' : 'Impact preview'}</div>
              <h2>{ko ? '업데이트 / 삭제 영향' : 'Update / destroy posture'}</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>{ko ? '다운타임 위험' : 'Downtime risk'}</span>
              <strong>{impact.downtime}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '영향 범위' : 'Blast radius'}</span>
              <strong>{impact.blastRadius}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '자원 영향' : 'Footprint'}</span>
              <strong>{impact.costDelta}</strong>
            </div>
          </div>
          <div className="field-group" style={{ marginTop: 14 }}>
            <div className="field-title">{ko ? '파괴 작업 보호 장치' : 'Destructive safeguards'}</div>
            <div className="stack-list">
              <div className="stack-row">
                <div>
                  <strong>{ko ? '환경 이름을 입력해야 destroy 계획이 활성화됩니다' : 'Type environment name to enable destroy plan'}</strong>
                  <div className="row-meta">{ko ? '이 화면에서 destroy 계획을 큐잉하려면 UI와 API 모두 환경 이름 확인이 필요합니다.' : 'Required by both the UI and API before a destroy plan can be queued from this surface.'}</div>
                </div>
              </div>
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              <span>{copy.approval.typedConfirmation}</span>
              <input value={typedConfirmation} onChange={(e) => setTypedConfirmation(e.target.value)} placeholder={environment?.name || 'environment-name'} />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              <span>{copy.approval.destroyComment}</span>
              <textarea
                value={destroyComment}
                onChange={(e) => setDestroyComment(e.target.value)}
                placeholder={copy.approval.destroyPlaceholder}
                rows={4}
              />
            </label>
          </div>
          <div className="detail-actions" style={{ marginTop: 14 }}>
            {canDestroy ? (
              <button
                className="ghost danger"
                onClick={() =>
                  setConfirmRequest({
                    tone: 'danger',
                    title: ko ? 'Destroy 계획을 큐잉하시겠습니까?' : 'Queue Destroy Plan?',
                    description: ko
                      ? 'destroy는 파괴적 변경 경로입니다. 실제 삭제 apply 전에도 승인 게이트를 통과해야 하지만, 지금 큐잉되는 계획은 감사 이력에 남습니다.'
                      : 'Destroy is a destructive change path. It still requires approval before apply, but this queued plan is recorded in the audit trail.',
                    confirmLabel: busy === 'destroy' ? copy.approval.queueingDestroy : copy.approval.queueDestroy,
                    details: [
                      { label: ko ? '환경' : 'Environment', value: environment?.name || environmentId },
                      { label: ko ? '입력 확인' : 'Typed confirmation', value: typedConfirmation },
                      { label: ko ? '다운타임 위험' : 'Downtime risk', value: impact.downtime },
                      { label: ko ? '감사 코멘트' : 'Audit comment', value: destroyComment.trim() || '-' },
                    ],
                    execute: async () =>
                      run('destroy', (env) =>
                        environments.destroy(environmentId, {
                          confirmation_name: environment?.name || '',
                          comment: destroyComment.trim(),
                          expected_revision: env?.revision,
                        }),
                      ),
                  })
                }
                disabled={busy !== null}
              >
                {busy === 'destroy' ? copy.approval.queueingDestroy : copy.approval.queueDestroy}
              </button>
            ) : (
              <button className="ghost danger" disabled>
                {copy.approval.destroyDisabled}
              </button>
            )}
          </div>
        </article>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">{ko ? '감사 추적' : 'Audit trail'}</div>
            <h2>{ko ? '변조 불가 승인 이력' : 'Immutable approval timeline'}</h2>
          </div>
          <button className="ghost" onClick={() => setShowAudit((current) => !current)}>
            {showAudit ? copy.approval.hideAuditTimeline : copy.approval.showAuditTimeline}
          </button>
        </div>
        {showAudit ? (
          <div className="audit-list">
            {auditItems.map((item) => (
              <div className="audit-item" key={item.id}>
                <div className="detail-top" style={{ alignItems: 'center' }}>
                  <strong>{displayAuditAction(item.action, ko)}</strong>
                  <span className="badge badge-muted">{formatDateTime(item.created_at, locale)}</span>
                </div>
                <div className="row-meta">{item.actor_email || (ko ? '시스템' : 'system')}</div>
                {item.message ? <div style={{ marginTop: 6 }}>{summarizeAuditMessage(item.message, ko)}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">{ko ? '승인/적용 이력이 길 경우 성능과 가독성을 위해 기본 접힘 상태로 표시됩니다.' : 'Timeline stays collapsed by default to reduce visual noise on long histories.'}</div>
        )}
      </section>
      <ConfirmDialog
        open={confirmRequest !== null}
        title={confirmRequest?.title || ''}
        description={confirmRequest?.description || ''}
        confirmLabel={confirmRequest?.confirmLabel || ''}
        cancelLabel={ko ? '취소' : 'Cancel'}
        tone={confirmRequest?.tone}
        details={confirmRequest?.details}
        busy={busy !== null}
        onCancel={() => setConfirmRequest(null)}
        onConfirm={() => void confirmPendingAction()}
      />
    </div>
  )
}
