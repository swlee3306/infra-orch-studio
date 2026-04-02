import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuditEvent, auth, Environment, environments, Job, TemplateDescriptor, templates } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import StatusBadge from '../components/StatusBadge'
import { validateEnvironmentSpecForWizard } from '../utils/environmentValidation'

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

function buildWorkflow(environment: Environment | null): WorkflowStep[] {
  if (!environment) {
    return [
      { label: 'Plan', detail: 'Loading environment state.', state: 'blocked' },
      { label: 'Approval', detail: 'Waiting for environment data.', state: 'blocked' },
      { label: 'Apply', detail: 'Waiting for environment data.', state: 'blocked' },
      { label: 'Result', detail: 'Waiting for environment data.', state: 'blocked' },
    ]
  }

  const planDone = Boolean(environment.last_plan_job_id) && environment.status !== 'planning'
  const applyDone = ['active', 'destroyed'].includes(environment.status)

  return [
    {
      label: 'Plan',
      detail:
        environment.status === 'planning'
          ? 'Runner is generating the current plan artifact.'
          : 'The latest plan artifact is attached to this environment.',
      state: environment.status === 'planning' ? 'current' : planDone ? 'complete' : 'blocked',
    },
    {
      label: 'Approval',
      detail:
        environment.approval_status === 'approved'
          ? `Approved by ${environment.approved_by_email || 'admin'}.`
          : environment.status === 'pending_approval'
            ? 'Awaiting approval before apply can be queued.'
            : 'Approval opens after a successful plan.',
      state:
        environment.approval_status === 'approved'
          ? 'complete'
          : environment.status === 'pending_approval'
            ? 'current'
            : 'blocked',
    },
    {
      label: 'Apply',
      detail:
        applyDone
          ? 'The approved plan has already been executed.'
          : environment.status === 'applying'
            ? 'Apply is currently running.'
            : environment.approval_status === 'approved'
              ? 'Apply can now be queued from the approved plan.'
              : 'Apply remains blocked until approval is recorded.',
      state: applyDone ? 'complete' : environment.status === 'applying' || environment.approval_status === 'approved' ? 'current' : 'blocked',
    },
    {
      label: 'Result',
      detail:
        environment.status === 'active'
          ? 'Environment is active and available for further operations.'
          : environment.status === 'destroyed'
            ? 'Environment is destroyed and preserved as a historical record.'
            : environment.status === 'failed'
              ? 'Lifecycle paused on failure. Review artifacts and retry budget.'
              : 'Result is available after apply finishes.',
      state: ['active', 'destroyed', 'failed'].includes(environment.status) ? 'current' : 'blocked',
    },
  ]
}

function nextActionHint(
  environment: Environment | null,
  viewer: { email: string; is_admin?: boolean } | null,
  canRetry: boolean,
): { tone: 'info' | 'warning' | 'danger' | 'success'; title: string; detail: string } {
  if (!environment) {
    return { tone: 'info', title: 'Loading environment', detail: 'Fetch the latest environment state before taking action.' }
  }
  if (environment.status === 'failed') {
    return canRetry
      ? {
          tone: 'warning',
          title: 'Retry budget is available',
          detail: 'Inspect the failed execution and retry the last failed step if the error looks transient.',
        }
      : {
          tone: 'danger',
          title: 'Retry budget exhausted',
          detail: 'Manual investigation is required before a new plan should be requested.',
        }
  }
  if (environment.status === 'pending_approval') {
    return viewer?.is_admin
      ? {
          tone: 'warning',
          title: 'Plan review is waiting for approval',
          detail: 'Review artifacts and approve only if the plan and risk posture are acceptable.',
        }
      : {
          tone: 'info',
          title: 'Waiting for admin approval',
          detail: 'The plan is ready. An admin must approve it before apply can be queued.',
        }
  }
  if (environment.approval_status === 'approved' && environment.status === 'approved') {
    return viewer?.is_admin
      ? {
          tone: 'success',
          title: 'Apply can be queued now',
          detail: 'The environment has cleared the approval gate and is ready for apply.',
        }
      : {
          tone: 'info',
          title: 'Approved and waiting for execution',
          detail: 'This environment is approved. An admin can now queue apply.',
        }
  }
  if (environment.status === 'planning' || environment.status === 'applying') {
    return {
      tone: 'info',
      title: 'Execution is in progress',
      detail: 'Follow the latest linked job and artifact updates while runner execution continues.',
    }
  }
  if (environment.status === 'active') {
    return {
      tone: 'success',
      title: 'Environment is operating normally',
      detail: 'Queue an update plan for desired-state changes or use the guarded destroy path when retiring it.',
    }
  }
  return {
    tone: 'info',
    title: 'Review lifecycle state',
    detail: 'Use metadata, recent jobs, outputs, and audit events to decide the next action.',
  }
}

export default function EnvironmentDetailPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [auditItems, setAuditItems] = useState<AuditEvent[]>([])
  const [environmentJobs, setEnvironmentJobs] = useState<Job[]>([])
  const [templateItems, setTemplateItems] = useState<TemplateDescriptor[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('basic')
  const [editingSpec, setEditingSpec] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const environmentId = useMemo(() => id || '', [id])
  const [artifacts, setArtifacts] = useState<{ workdir?: string; plan_path?: string; outputs_json?: string } | null>(null)
  const outputs = useMemo(() => parseJson(artifacts?.outputs_json || environment?.outputs_json), [artifacts?.outputs_json, environment?.outputs_json])
  const currentPlanJob = useMemo(
    () => environmentJobs.find((item) => item.id === environment?.last_plan_job_id) || null,
    [environment?.last_plan_job_id, environmentJobs],
  )
  const recentJobs = useMemo(() => environmentJobs.slice(0, 4), [environmentJobs])
  const updateValidation = useMemo(
    () => (editingSpec ? validateEnvironmentSpecForWizard(editingSpec) : { fieldErrors: {}, stepErrors: {} as Record<number, string[]> }),
    [editingSpec],
  )
  const updateErrorCount = Object.keys(updateValidation.fieldErrors).length

  async function load() {
    setError(null)
    try {
      const me = await auth.me()
      setViewer(me)
    } catch {
      nav('/login')
      return
    }
    if (!environmentId) return

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
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    load()
  }, [environmentId])

  async function runAction(
    action: string,
    fn: () => Promise<any>,
    options?: { confirmMessage?: string },
  ) {
    if (options?.confirmMessage && !window.confirm(options.confirmMessage)) {
      return
    }
    setBusyAction(action)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err: any) {
      setError(err?.message || 'failed')
    } finally {
      setBusyAction(null)
    }
  }

  const canPlanUpdate = Boolean(environment && editingSpec && busyAction === null && updateErrorCount === 0)
  const canApprove = Boolean(viewer?.is_admin && environment?.status === 'pending_approval')
  const canApply = Boolean(viewer?.is_admin && environment?.approval_status === 'approved')
  const canRetry = Boolean(environment?.status === 'failed' && (environment.retry_count || 0) < (environment?.max_retries || 0))
  const canDestroy = Boolean(
    environment && !['destroyed', 'destroying', 'planning', 'applying'].includes(environment.status),
  )
  const workflow = buildWorkflow(environment)
  const actionHint = nextActionHint(environment, viewer, canRetry)
  const reviewRoute = environment ? `/environments/${environment.id}/review` : ''
  const approvalRoute = environment ? `/environments/${environment.id}/approval` : ''

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">
            <Link to="/environments" className="text-link">
              Ops / Environments
            </Link>{' '}
            / Detail
          </div>
          <h1 className="page-title">{environment?.name || environmentId}</h1>
          <p className="page-copy">
            Operate the environment as a durable platform object with lifecycle, approval, result artifacts, and immutable audit context.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
            Refresh
          </button>
          {environment ? (
            <Link to={reviewRoute} className="ghost action-link">
              Open review
            </Link>
          ) : null}
          {environment && (environment.approval_status === 'approved' || environment.status === 'pending_approval') ? (
            <Link to={approvalRoute} className="ghost action-link">
              Approval control
            </Link>
          ) : null}
          <button
            className="ghost"
            disabled={!canPlanUpdate || busyAction !== null}
            onClick={() =>
              runAction('update-plan', () => environments.plan(environmentId, editingSpec, 'update', selectedTemplate))
            }
          >
            {busyAction === 'update-plan' ? 'Queueing...' : 'Queue update plan'}
          </button>
          {canApprove ? (
            <button onClick={() => runAction('approve', () => environments.approve(environmentId))} disabled={busyAction !== null}>
              {busyAction === 'approve' ? 'Approving...' : 'Approve'}
            </button>
          ) : null}
          {canApply ? (
            <button
              onClick={() =>
                runAction('apply', () => environments.apply(environmentId), {
                  confirmMessage: 'Queue apply for the currently approved plan?',
                })
              }
              disabled={busyAction !== null}
            >
              {busyAction === 'apply' ? 'Applying...' : 'Apply approved plan'}
            </button>
          ) : null}
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

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
              <div className="section-kicker">Overview</div>
              <h2>Metadata summary</h2>
            </div>
          </div>
          <div className="info-grid info-grid-three">
            <div className="meta-item">
              <span>Lifecycle</span>
              <StatusBadge status={environment?.status || ''} />
            </div>
            <div className="meta-item">
              <span>Approval</span>
              <StatusBadge status={environment?.approval_status || ''} />
            </div>
            <div className="meta-item">
              <span>Operation</span>
              <strong>{environment?.operation || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Environment ID</span>
              <strong>{environment?.id || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Owner</span>
              <strong>{environment?.created_by_email || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Approved by</span>
              <strong>{environment?.approved_by_email || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Created</span>
              <strong>{environment?.created_at ? new Date(environment.created_at).toLocaleString() : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Updated</span>
              <strong>{environment?.updated_at ? new Date(environment.updated_at).toLocaleString() : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Retry budget</span>
              <strong>
                {environment?.retry_count || 0} / {environment?.max_retries || 0}
              </strong>
            </div>
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Workflow</div>
              <h2>Plan {'->'} approval {'->'} apply {'->'} result</h2>
            </div>
          </div>
          <div className="workflow-steps">
            {workflow.map((step) => (
              <div className={`workflow-step workflow-step-${step.state}`} key={step.label}>
                <div className="workflow-step-head">
                  <strong>{step.label}</strong>
                  <span className="badge badge-muted">{step.state}</span>
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
              <div className="section-kicker">Desired state</div>
              <h2>Resource and specification inventory</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>Tenant</span>
              <strong>{environment?.spec.tenant_name || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Network</span>
              <strong>{environment?.spec.network.name || '-'}</strong>
              <div className="row-meta">{environment?.spec.network.cidr || '-'}</div>
            </div>
            <div className="meta-item">
              <span>Subnet</span>
              <strong>{environment?.spec.subnet.name || '-'}</strong>
              <div className="row-meta">{environment?.spec.subnet.cidr || '-'}</div>
            </div>
            <div className="meta-item">
              <span>Instances</span>
              <strong>{environment?.spec.instances.length || 0}</strong>
            </div>
            <div className="meta-item">
              <span>Security groups</span>
              <strong>{environment?.spec.security_groups?.length || 0}</strong>
            </div>
            <div className="meta-item">
              <span>Plan artifact</span>
              <strong>{artifacts?.plan_path || environment?.plan_path || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Template</span>
              <strong>{currentPlanJob?.template_name || selectedTemplate}</strong>
            </div>
          </div>
          <div className="field-group" style={{ marginTop: 16 }}>
            <div className="field-title">Environment spec</div>
            {updateErrorCount > 0 ? (
              <div className="error-box" style={{ marginBottom: 14 }}>
                Resolve {updateErrorCount} input issue(s) before queueing an update plan.
              </div>
            ) : null}
            <label className="field" style={{ marginBottom: 14 }}>
              <span>Plan template</span>
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
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Recent jobs</div>
              <h2>Execution records</h2>
            </div>
          </div>
          <div className="stack-list">
            {recentJobs.length === 0 ? (
              <div className="empty-state">No environment-scoped jobs were found.</div>
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
              Last error: {environment.last_error}
            </div>
          ) : null}
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Outputs</div>
              <h2>Artifacts and result pointers</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-row">
              <div>
                <strong>Workdir</strong>
                <div className="row-meta">{artifacts?.workdir || environment?.workdir || '-'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>Plan path</strong>
                <div className="row-meta">{artifacts?.plan_path || environment?.plan_path || '-'}</div>
              </div>
            </div>
          </div>
          {outputs ? (
            <pre className="json-block" style={{ marginTop: 14 }}>
              {JSON.stringify(outputs, null, 2)}
            </pre>
          ) : (
            <div className="empty-state" style={{ marginTop: 14 }}>
              No outputs recorded yet.
            </div>
          )}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Audit</div>
              <h2>Approval / audit timeline</h2>
            </div>
          </div>
          <div className="audit-list">
            {auditItems.length === 0 ? (
              <div className="empty-state">No audit events yet.</div>
            ) : (
              auditItems.map((item) => {
                const metadata = parseJson(item.metadata_json)
                return (
                  <div className="audit-item" key={item.id}>
                    <div className="detail-top" style={{ alignItems: 'center' }}>
                      <strong>{item.action}</strong>
                      <span className="badge badge-muted">{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    <div className="row-meta">{item.actor_email || 'system'}</div>
                    {item.message ? <div style={{ marginTop: 6 }}>{item.message}</div> : null}
                    {metadata ? (
                      <pre className="json-block" style={{ marginTop: 10 }}>
                        {JSON.stringify(metadata, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Safe action hierarchy</div>
              <h2>Guarded operations</h2>
            </div>
          </div>
          <div className="stack-list">
            {environment ? (
              <Link to={reviewRoute} className="stack-row stack-row-link">
                <div>
                  <strong>Open plan review</strong>
                  <div className="row-meta">Inspect risk signals, impact summary, and approval readiness for this environment.</div>
                </div>
              </Link>
            ) : null}
            {environment && (environment.approval_status === 'approved' || environment.status === 'pending_approval') ? (
              <Link to={approvalRoute} className="stack-row stack-row-link">
                <div>
                  <strong>Open approval control</strong>
                  <div className="row-meta">Use the dedicated guarded surface for approve, apply, and destructive confirmation.</div>
                </div>
              </Link>
            ) : null}
            <div className="stack-row">
              <div>
                <strong>Operate now</strong>
                <div className="row-meta">Refresh current state and inspect the linked execution records.</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>Schedule update</strong>
                <div className="row-meta">Edit desired state and queue a fresh plan before any mutation is applied.</div>
              </div>
            </div>
            <div className="stack-row stack-row-danger">
              <div>
                <strong>Destroy environment</strong>
                <div className="row-meta">Dangerous operation. Requires explicit confirmation before the destroy plan is queued.</div>
              </div>
            </div>
          </div>
          <div className="detail-actions" style={{ marginTop: 14 }}>
            {canRetry ? (
              <button className="ghost" onClick={() => runAction('retry', () => environments.retry(environmentId))} disabled={busyAction !== null}>
                {busyAction === 'retry' ? 'Retrying...' : 'Retry failed step'}
              </button>
            ) : null}
            {canDestroy && environment ? (
              <Link to={approvalRoute} className="ghost action-link danger">
                Open destroy control
              </Link>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  )
}
