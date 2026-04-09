import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuditEvent, auth, Environment, environments, Job, TemplateDescriptor, templates } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import StatusBadge from '../components/StatusBadge'
import { useI18n } from '../i18n'
import { validateEnvironmentSpecForWizard } from '../utils/environmentValidation'
import { displayAuditAction, errorLooksRaw, isRevisionConflictError, summarizeAuditMessage, summarizeEnvironmentConflictDelta, summarizeOperatorError } from '../utils/uiCopy'

function parseJson(value?: string): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

type WorkflowStep = {
  label: string
  detail: string
  state: 'complete' | 'current' | 'blocked'
}

function buildWorkflow(environment: Environment | null, ko: boolean): WorkflowStep[] {
  if (!environment) {
    return [
      { label: ko ? '계획' : 'Plan', detail: ko ? '환경 상태를 불러오는 중입니다.' : 'Loading environment state.', state: 'blocked' },
      { label: ko ? '승인' : 'Approval', detail: ko ? '환경 데이터를 기다리는 중입니다.' : 'Waiting for environment data.', state: 'blocked' },
      { label: ko ? '적용' : 'Apply', detail: ko ? '환경 데이터를 기다리는 중입니다.' : 'Waiting for environment data.', state: 'blocked' },
      { label: ko ? '결과' : 'Result', detail: ko ? '환경 데이터를 기다리는 중입니다.' : 'Waiting for environment data.', state: 'blocked' },
    ]
  }

  const planDone = Boolean(environment.last_plan_job_id) && environment.status !== 'planning'
  const applyDone = ['active', 'destroyed'].includes(environment.status)

  return [
    {
      label: ko ? '계획' : 'Plan',
      detail:
        environment.status === 'planning'
          ? ko ? '러너가 현재 계획 산출물을 생성하고 있습니다.' : 'Runner is generating the current plan artifact.'
          : ko ? '최신 계획 산출물이 이 환경에 연결되어 있습니다.' : 'The latest plan artifact is attached to this environment.',
      state: environment.status === 'planning' ? 'current' : planDone ? 'complete' : 'blocked',
    },
    {
      label: ko ? '승인' : 'Approval',
      detail:
        environment.approval_status === 'approved'
          ? ko ? `${environment.approved_by_email || 'admin'} 승인 완료.` : `Approved by ${environment.approved_by_email || 'admin'}.`
          : environment.status === 'pending_approval'
            ? ko ? 'apply를 큐잉하기 전에 승인을 기다리고 있습니다.' : 'Awaiting approval before apply can be queued.'
            : ko ? '계획이 성공하면 승인 단계가 열립니다.' : 'Approval opens after a successful plan.',
      state:
        environment.approval_status === 'approved'
          ? 'complete'
          : environment.status === 'pending_approval'
            ? 'current'
            : 'blocked',
    },
    {
      label: ko ? '적용' : 'Apply',
      detail:
        applyDone
          ? ko ? '승인된 계획이 이미 실행되었습니다.' : 'The approved plan has already been executed.'
          : environment.status === 'applying'
            ? ko ? '현재 apply가 실행 중입니다.' : 'Apply is currently running.'
            : environment.approval_status === 'approved'
              ? ko ? '이제 승인된 계획에서 apply를 큐잉할 수 있습니다.' : 'Apply can now be queued from the approved plan.'
              : ko ? '승인이 기록되기 전까지 apply는 차단됩니다.' : 'Apply remains blocked until approval is recorded.',
      state: applyDone ? 'complete' : environment.status === 'applying' || environment.approval_status === 'approved' ? 'current' : 'blocked',
    },
    {
      label: ko ? '결과' : 'Result',
      detail:
        environment.status === 'active'
          ? ko ? '환경이 활성 상태이며 추가 작업이 가능합니다.' : 'Environment is active and available for further operations.'
          : environment.status === 'destroyed'
            ? ko ? '환경이 삭제되었고 기록으로 보존됩니다.' : 'Environment is destroyed and preserved as a historical record.'
            : environment.status === 'failed'
              ? ko ? '실패로 라이프사이클이 멈췄습니다. 산출물과 재시도 예산을 확인하세요.' : 'Lifecycle paused on failure. Review artifacts and retry budget.'
              : ko ? 'apply가 끝나면 결과를 확인할 수 있습니다.' : 'Result is available after apply finishes.',
      state: ['active', 'destroyed', 'failed'].includes(environment.status) ? 'current' : 'blocked',
    },
  ]
}

function nextActionHint(
  environment: Environment | null,
  viewer: { email: string; is_admin?: boolean } | null,
  canRetry: boolean,
  ko: boolean,
): { tone: 'info' | 'warning' | 'danger' | 'success'; title: string; detail: string } {
  if (!environment) {
    return { tone: 'info', title: ko ? '환경 로딩 중' : 'Loading environment', detail: ko ? '작업 전 최신 환경 상태를 불러오세요.' : 'Fetch the latest environment state before taking action.' }
  }
  if (environment.status === 'failed') {
    return canRetry
      ? {
          tone: 'warning',
          title: ko ? '재시도 예산이 남아 있습니다' : 'Retry budget is available',
          detail: ko ? '실패한 실행을 확인하고 일시적 오류로 보이면 마지막 실패 단계를 재시도하세요.' : 'Inspect the failed execution and retry the last failed step if the error looks transient.',
        }
      : {
          tone: 'danger',
          title: ko ? '재시도 예산이 소진되었습니다' : 'Retry budget exhausted',
          detail: ko ? '새 계획을 요청하기 전에 수동 점검이 필요합니다.' : 'Manual investigation is required before a new plan should be requested.',
        }
  }
  if (environment.status === 'pending_approval') {
    return viewer?.is_admin
      ? {
          tone: 'warning',
          title: ko ? '계획 검토가 승인을 기다리고 있습니다' : 'Plan review is waiting for approval',
          detail: ko ? '산출물을 검토하고 계획과 위험 수준이 허용 가능할 때만 승인하세요.' : 'Review artifacts and approve only if the plan and risk posture are acceptable.',
        }
      : {
          tone: 'info',
          title: ko ? '관리자 승인을 기다리는 중' : 'Waiting for admin approval',
          detail: ko ? '계획이 준비되었습니다. apply를 큐잉하려면 관리자의 승인이 필요합니다.' : 'The plan is ready. An admin must approve it before apply can be queued.',
        }
  }
  if (environment.approval_status === 'approved' && environment.status === 'approved') {
    return viewer?.is_admin
      ? {
          tone: 'success',
          title: ko ? '이제 apply를 큐잉할 수 있습니다' : 'Apply can be queued now',
          detail: ko ? '이 환경은 승인 게이트를 통과했고 apply 준비가 끝났습니다.' : 'The environment has cleared the approval gate and is ready for apply.',
        }
      : {
          tone: 'info',
          title: ko ? '승인 완료, 실행 대기 중' : 'Approved and waiting for execution',
          detail: ko ? '이 환경은 승인되었습니다. 이제 관리자가 apply를 큐잉할 수 있습니다.' : 'This environment is approved. An admin can now queue apply.',
        }
  }
  if (environment.status === 'planning' || environment.status === 'applying') {
    return {
      tone: 'info',
      title: ko ? '실행이 진행 중입니다' : 'Execution is in progress',
      detail: ko ? '러너 실행이 계속되는 동안 최신 작업과 산출물 업데이트를 확인하세요.' : 'Follow the latest linked job and artifact updates while runner execution continues.',
    }
  }
  if (environment.status === 'active') {
    return {
      tone: 'success',
      title: ko ? '환경이 정상 운영 중입니다' : 'Environment is operating normally',
      detail: ko ? '원하는 상태가 바뀌면 update plan을 큐잉하고, 종료 시에는 보호된 destroy 경로를 사용하세요.' : 'Queue an update plan for desired-state changes or use the guarded destroy path when retiring it.',
    }
  }
  return {
    tone: 'info',
    title: ko ? '라이프사이클 상태 검토' : 'Review lifecycle state',
    detail: ko ? '메타데이터, 최근 작업, 출력, 감사 이벤트를 보고 다음 작업을 결정하세요.' : 'Use metadata, recent jobs, outputs, and audit events to decide the next action.',
  }
}

export default function EnvironmentDetailPage() {
  const nav = useNavigate()
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
  const { id } = useParams()
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [auditItems, setAuditItems] = useState<AuditEvent[]>([])
  const [environmentJobs, setEnvironmentJobs] = useState<Job[]>([])
  const [templateItems, setTemplateItems] = useState<TemplateDescriptor[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('basic')
  const [editingSpec, setEditingSpec] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflictHint, setConflictHint] = useState<string | null>(null)
  const [retryLabel, setRetryLabel] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const retryRef = useRef<null | (() => Promise<void>)>(null)

  const environmentId = useMemo(() => id || '', [id])
  const [artifacts, setArtifacts] = useState<{ workdir?: string; plan_path?: string; outputs_json?: string } | null>(null)
  const outputs = useMemo(() => parseJson(artifacts?.outputs_json || environment?.outputs_json), [artifacts?.outputs_json, environment?.outputs_json])
  const currentPlanJob = useMemo(
    () => environmentJobs.find((item) => item.id === environment?.last_plan_job_id) || null,
    [environment?.last_plan_job_id, environmentJobs],
  )
  const recentJobs = useMemo(() => environmentJobs.slice(0, 4), [environmentJobs])
  const recentAuditItems = useMemo(() => auditItems.slice(0, 5), [auditItems])
  const updateValidation = useMemo(
    () => (editingSpec ? validateEnvironmentSpecForWizard(editingSpec) : { fieldErrors: {}, stepErrors: {} as Record<number, string[]> }),
    [editingSpec],
  )
  const updateErrorCount = Object.keys(updateValidation.fieldErrors).length

  async function load(): Promise<Environment | null> {
    setError(null)
    try {
      const me = await auth.me()
      setViewer(me)
    } catch {
      nav('/login')
      return null
    }
    if (!environmentId) return null

    try {
      const [env, audit, environmentJobsResponse, artifactResponse, templateRes] = await Promise.all([
        environments.get(environmentId),
        environments.audit(environmentId),
        environments.jobs(environmentId),
        environments.artifacts(environmentId),
        templates.list().catch(() => null),
      ])
      setEnvironment(env)
      setEditingSpec(env.spec)
      setAuditItems(audit.items)
      const envJobs = environmentJobsResponse.items
      setEnvironmentJobs(envJobs)
      setArtifacts(artifactResponse)
      if (templateRes) {
        setTemplateItems(templateRes.environment_sets)
      } else {
        setTemplateItems([])
      }
      const planTemplate = envJobs.find((item) => item.id === env.last_plan_job_id)?.template_name || 'basic'
      setSelectedTemplate(planTemplate)
      return env
    } catch (err: any) {
      setError(err?.message || 'failed')
      return null
    }
  }

  useEffect(() => {
    load()
  }, [environmentId])

  useEffect(() => {
    setShowQuickActions(false)
  }, [environmentId])

  async function runAction(
    action: string,
    execute: (env: Environment | null) => Promise<any>,
    options?: { confirmMessage?: string },
  ) {
    if (options?.confirmMessage && !window.confirm(options.confirmMessage)) {
      return
    }
    setBusyAction(action)
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
      setError(message)
      retryRef.current = async () => runAction(action, execute, options)
      setRetryLabel(action)
    } finally {
      setBusyAction(null)
    }
  }

  const canPlanUpdate = Boolean(environment && editingSpec && busyAction === null && updateErrorCount === 0)
  const canRetry = Boolean(environment?.status === 'failed' && (environment.retry_count || 0) < (environment?.max_retries || 0))
  const canDestroy = Boolean(
    environment && !['destroyed', 'destroying', 'planning', 'applying'].includes(environment.status),
  )
  const workflow = buildWorkflow(environment, ko)
  const actionHint = nextActionHint(environment, viewer, canRetry, ko)
  const reviewRoute = environment ? `/environments/${environment.id}/review` : ''
  const approvalRoute = environment ? `/environments/${environment.id}/approval` : ''

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">
            <Link to="/environments" className="text-link">
              {ko ? '운영 / 환경' : 'Ops / Environments'}
            </Link>{' '}
            / {copy.detail.kicker}
          </div>
          <h1 className="page-title">{environment?.name || environmentId}</h1>
          <p className="page-copy">{copy.detail.copy}</p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={() => { setConflictHint(null); void load() }}>
            {copy.detail.refresh}
          </button>
          {environment ? (
            <Link to={reviewRoute} className="ghost action-link action-link-button">
              {copy.detail.openReview}
            </Link>
          ) : null}
          {environment && (environment.approval_status === 'approved' || environment.status === 'pending_approval') ? (
            <Link to={approvalRoute} className="ghost action-link action-link-button">
              {copy.detail.approvalControl}
            </Link>
          ) : null}
          <button
            className="ghost"
            disabled={!canPlanUpdate || busyAction !== null}
            onClick={() =>
              runAction('update-plan', (env) => environments.plan(environmentId, editingSpec, 'update', selectedTemplate, env?.revision))
            }
          >
            {busyAction === 'update-plan' ? copy.detail.queueing : copy.detail.queueUpdate}
          </button>
        </div>
      </section>

      {error ? (
        <section className="error-box">
          <strong>{summarizeOperatorError(error)}</strong>
          {retryRef.current ? (
            <div style={{ marginTop: 10 }}>
              <button className="ghost" onClick={() => void retryRef.current?.()} disabled={busyAction !== null}>
                {ko ? `마지막 작업 재시도${retryLabel ? ` (${retryLabel})` : ''}` : `Retry last action${retryLabel ? ` (${retryLabel})` : ''}`}
              </button>
            </div>
          ) : null}
          {errorLooksRaw(error) && summarizeOperatorError(error) !== error ? (
            <details style={{ marginTop: 8 }}>
              <summary>{ko ? '원본 오류 보기' : 'Show raw error'}</summary>
              <div style={{ marginTop: 8 }}>{error}</div>
            </details>
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

      <section className="console-card">
        <div className={`callout callout-${actionHint.tone}`}>
          <strong>{actionHint.title}</strong>
          <p style={{ margin: '6px 0 0' }}>{actionHint.detail}</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '개요' : 'Overview'}</div>
              <h2>{ko ? '운영 요약' : 'Operating summary'}</h2>
            </div>
          </div>
          <div className="info-grid info-grid-three">
            <div className="meta-item">
              <span>{ko ? '라이프사이클' : 'Lifecycle'}</span>
              <StatusBadge status={environment?.status || ''} />
            </div>
            <div className="meta-item">
              <span>{ko ? '승인' : 'Approval'}</span>
              <StatusBadge status={environment?.approval_status || ''} />
            </div>
            <div className="meta-item">
              <span>{ko ? '작업' : 'Operation'}</span>
              <strong>{environment?.operation || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '환경 ID' : 'Environment ID'}</span>
              <strong>{environment?.id || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '소유자' : 'Owner'}</span>
              <strong>{environment?.created_by_email || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '승인자' : 'Approved by'}</span>
              <strong>{environment?.approved_by_email || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '생성 시각' : 'Created'}</span>
              <strong>{environment?.created_at ? new Date(environment.created_at).toLocaleString() : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '업데이트 시각' : 'Updated'}</span>
              <strong>{environment?.updated_at ? new Date(environment.updated_at).toLocaleString() : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '재시도 예산' : 'Retry budget'}</span>
              <strong>
                {environment?.retry_count || 0} / {environment?.max_retries || 0}
              </strong>
            </div>
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '워크플로' : 'Workflow'}</div>
              <h2>{ko ? '계획 -> 승인 -> 적용 -> 결과' : 'Plan -> approval -> apply -> result'}</h2>
            </div>
          </div>
          <div className="workflow-steps">
            {workflow.map((step) => (
              <div className={`workflow-step workflow-step-${step.state}`} key={step.label}>
                <div className="workflow-step-head">
                  <strong>{step.label}</strong>
                  <span className="badge badge-muted">{ko ? (step.state === 'complete' ? '완료' : step.state === 'current' ? '진행' : '대기') : step.state}</span>
                </div>
                <p>{step.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '목표 상태' : 'Desired state'}</div>
              <h2>{ko ? '목표 상태 스냅샷' : 'Desired-state snapshot'}</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>{ko ? '테넌트' : 'Tenant'}</span>
              <strong>{environment?.spec.tenant_name || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '네트워크' : 'Network'}</span>
              <strong>{environment?.spec.network.name || '-'}</strong>
              <div className="row-meta">{environment?.spec.network.cidr || '-'}</div>
            </div>
            <div className="meta-item">
              <span>{ko ? '서브넷' : 'Subnet'}</span>
              <strong>{environment?.spec.subnet.name || '-'}</strong>
              <div className="row-meta">{environment?.spec.subnet.cidr || '-'}</div>
            </div>
            <div className="meta-item">
              <span>{ko ? '인스턴스' : 'Instances'}</span>
              <strong>{environment?.spec.instances.length || 0}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '보안 그룹' : 'Security groups'}</span>
              <strong>{environment?.spec.security_groups?.length || 0}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '템플릿 세트' : 'Template set'}</span>
              <strong>{currentPlanJob?.template_name || selectedTemplate}</strong>
              <div className="row-meta">{ko ? '템플릿' : 'Template'}</div>
            </div>
            <div className="meta-item">
              <span>{ko ? '계획 산출물' : 'Plan artifact'}</span>
              <strong>{artifacts?.plan_path || environment?.plan_path || '-'}</strong>
            </div>
          </div>
          <div className="callout callout-info" style={{ marginTop: 16 }}>
            <strong>{ko ? '업데이트 계획은 목표 상태 편집기 뒤에서만 큐잉할 수 있습니다' : 'Update planning stays gated behind the desired-state editor'}</strong>
            <p style={{ margin: '6px 0 0' }}>
              {ko ? '새 계획이 필요할 때만 편집기를 열어 주세요. 현재 환경 상태는 위에서 계속 확인할 수 있습니다.' : 'Open the editor only when you need to prepare a new plan. The current environment posture remains visible above.'}
            </p>
          </div>
          <details className="console-details">
            <summary>{ko ? '목표 상태를 수정하고 업데이트 계획 큐잉' : 'Edit desired state and queue an update plan'}</summary>
            <div className="field-group" style={{ marginTop: 14 }}>
              <div className="field-title">{ko ? '환경 스펙' : 'Environment spec'}</div>
              {updateErrorCount > 0 ? (
                <div className="error-box" style={{ marginBottom: 14 }}>
                  {ko ? `업데이트 계획을 큐잉하기 전에 입력 문제 ${updateErrorCount}개를 해결하세요.` : `Resolve ${updateErrorCount} input issue(s) before queueing an update plan.`}
                </div>
              ) : null}
              <label className="field" style={{ marginBottom: 14 }}>
                <span>{ko ? '계획 템플릿' : 'Plan template'}</span>
                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
                  {templateItems.length === 0 ? <option value="basic">basic</option> : null}
                  {templateItems.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {editingSpec ? <EnvironmentSpecForm value={editingSpec} onChange={setEditingSpec} errors={updateValidation.fieldErrors} /> : null}
            </div>
          </details>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '최근 작업' : 'Recent jobs'}</div>
              <h2>{ko ? '실행 기록' : 'Execution records'}</h2>
            </div>
          </div>
          <div className="stack-list">
            {recentJobs.length === 0 ? (
              <div className="empty-state">{ko ? '이 환경에 연결된 작업이 없습니다.' : 'No environment-scoped jobs were found.'}</div>
            ) : (
              recentJobs.map((item) => (
                <Link key={item.id} to={`/jobs/${item.id}`} className="stack-row stack-row-link">
                  <div>
                    <strong>{item.type}</strong>
                    <div className="row-meta">
                      {item.id.slice(0, 8)} · {item.requested_by || '-'} · {item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </Link>
              ))
            )}
          </div>
          {environment?.last_error ? (
            <div className="error-box" style={{ marginTop: 14 }}>
              <strong>{ko ? '마지막 오류' : 'Last error'}</strong>
              <div style={{ marginTop: 6 }}>{summarizeOperatorError(environment.last_error)}</div>
              {errorLooksRaw(environment.last_error) && summarizeOperatorError(environment.last_error) !== environment.last_error ? (
                <details style={{ marginTop: 8 }}>
                  <summary>{ko ? '원본 오류 보기' : 'Show raw error'}</summary>
                  <div style={{ marginTop: 8 }}>{environment.last_error}</div>
                </details>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '출력' : 'Outputs'}</div>
              <h2>{ko ? '산출물 및 결과 경로' : 'Artifacts and result pointers'}</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-row">
              <div>
                <strong>{ko ? '작업 디렉터리' : 'Workdir'}</strong>
                <div className="row-meta">{artifacts?.workdir || environment?.workdir || '-'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>{ko ? '계획 경로' : 'Plan path'}</strong>
                <div className="row-meta">{artifacts?.plan_path || environment?.plan_path || '-'}</div>
              </div>
            </div>
          </div>
          {outputs ? (
            <details className="console-details">
              <summary>{ko ? '구조화된 출력 보기' : 'Show structured outputs'}</summary>
              <pre className="json-block" style={{ marginTop: 14 }}>
                {JSON.stringify(outputs, null, 2)}
              </pre>
            </details>
          ) : (
            <div className="empty-state" style={{ marginTop: 14 }}>
              {ko ? '아직 기록된 출력이 없습니다.' : 'No outputs recorded yet.'}
            </div>
          )}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '감사' : 'Audit'}</div>
              <h2>{ko ? '승인 / 감사 타임라인' : 'Approval / audit timeline'}</h2>
            </div>
            <span className="badge badge-muted">{ko ? '최신 5건' : 'Latest 5'}</span>
          </div>
          <div className="audit-list">
            {recentAuditItems.length === 0 ? (
              <div className="empty-state">{ko ? '아직 감사 이벤트가 없습니다.' : 'No audit events yet.'}</div>
            ) : (
              recentAuditItems.map((item) => {
                const metadata = parseJson(item.metadata_json)
                return (
                  <div className="audit-item" key={item.id}>
                    <div className="detail-top" style={{ alignItems: 'center' }}>
                      <strong>{displayAuditAction(item.action, ko)}</strong>
                      <span className="badge badge-muted">{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    <div className="row-meta">{item.actor_email || (ko ? '시스템' : 'system')}</div>
                    {item.message ? <div style={{ marginTop: 6 }}>{summarizeAuditMessage(item.message, ko)}</div> : null}
                    {metadata ? (
                      <details className="console-details console-details-inline">
                        <summary>{ko ? '메타데이터 보기' : 'Show metadata'}</summary>
                        <pre className="json-block" style={{ marginTop: 10 }}>
                          {JSON.stringify(metadata, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
          <div className="detail-actions" style={{ marginTop: 12 }}>
            <Link to="/audit" className="ghost action-link action-link-button">
              {ko ? '전체 감사 로그 열기' : 'Open full audit log'}
            </Link>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '빠른 작업' : 'Quick actions'}</div>
              <h2>{ko ? '다음 운영 작업' : 'Next operator actions'}</h2>
            </div>
          </div>
          <button type="button" className="ghost" onClick={() => setShowQuickActions((prev) => !prev)}>
            {showQuickActions
              ? ko ? '작업 안내 및 빠른 작업 접기' : 'Hide action guide and quick actions'
              : ko ? '작업 안내 및 빠른 작업 보기' : 'Show action guide and quick actions'}
          </button>
          {showQuickActions ? (
            <>
              <div className="stack-list" style={{ marginTop: 12 }}>
                <div className="stack-row">
                  <div className="row-meta">{ko ? '1) 계획 검토에서 영향/리스크 확인' : '1) Confirm impact and risk in plan review'}</div>
                </div>
                <div className="stack-row">
                  <div className="row-meta">{ko ? '2) 승인 제어에서 승인/적용/삭제 수행' : '2) Approve, apply, or destroy from approval control'}</div>
                </div>
                <div className="stack-row">
                  <div className="row-meta">{ko ? '3) 실패 시 재시도 예산 확인 후 재시도' : '3) Use retry only when retry budget remains'}</div>
                </div>
              </div>
              <div className="detail-actions" style={{ marginTop: 14 }}>
                {environment ? (
                  <Link to={reviewRoute} className="ghost action-link action-link-button">
                    {ko ? '계획 검토 열기' : 'Open plan review'}
                  </Link>
                ) : null}
                {environment && (environment.approval_status === 'approved' || environment.status === 'pending_approval') ? (
                  <Link to={approvalRoute} className="ghost action-link action-link-button">
                    {ko ? '승인 제어 열기' : 'Open approval control'}
                  </Link>
                ) : null}
                {canRetry ? (
                  <button className="ghost" onClick={() => runAction('retry', (env) => environments.retry(environmentId, env?.revision))} disabled={busyAction !== null}>
                    {busyAction === 'retry' ? copy.detail.retrying : copy.detail.retry}
                  </button>
                ) : null}
                {canDestroy && environment ? (
                  <Link to={approvalRoute} className="ghost action-link action-link-button danger">
                    {copy.detail.openDestroyControl}
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}
        </article>
      </section>
    </div>
  )
}
