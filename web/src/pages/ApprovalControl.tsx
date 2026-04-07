import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuditEvent, auth, Environment, environments, Job } from '../api'
import { useI18n } from '../i18n'
import { buildApprovalCheckpoints, buildImpactSummary, findLatestPlanJob } from '../utils/environmentView'

export default function ApprovalControlPage() {
  const nav = useNavigate()
  const { copy } = useI18n()
  const { id } = useParams()
  const environmentId = id || ''
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [jobsForEnvironment, setJobsForEnvironment] = useState<Job[]>([])
  const [auditItems, setAuditItems] = useState<AuditEvent[]>([])
  const [approvalComment, setApprovalComment] = useState('')
  const [typedConfirmation, setTypedConfirmation] = useState('')
  const [destroyComment, setDestroyComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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
      const [env, audit, environmentJobs] = await Promise.all([
        environments.get(environmentId),
        environments.audit(environmentId),
        environments.jobs(environmentId),
      ])
      setEnvironment(env)
      setAuditItems(audit.items)
      setJobsForEnvironment(environmentJobs.items)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    load()
  }, [environmentId])

  const planJob = useMemo(() => findLatestPlanJob(environment, jobsForEnvironment), [environment, jobsForEnvironment])
  const typedConfirmationReady = typedConfirmation === (environment?.name || '')
  const checkpoints = useMemo(
    () => buildApprovalCheckpoints(environment, planJob, typedConfirmationReady),
    [environment, planJob, typedConfirmationReady],
  )
  const impact = useMemo(
    () =>
      buildImpactSummary(
        environment?.spec || { environment_name: '', tenant_name: '', network: { name: '', cidr: '' }, subnet: { name: '', cidr: '', enable_dhcp: true }, instances: [] },
        environment?.operation || 'update',
      ),
    [environment],
  )

  async function run(action: string, fn: () => Promise<any>, opts?: { confirm?: string }) {
    if (opts?.confirm && !window.confirm(opts.confirm)) return
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

  const canApprove = Boolean(viewer?.is_admin && environment?.status === 'pending_approval')
  const canApply = Boolean(viewer?.is_admin && environment?.approval_status === 'approved')
  const canDestroy = Boolean(viewer?.is_admin && typedConfirmationReady && environment)

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">
            <Link to="/environments" className="text-link">
              Environments
            </Link>{' '}
            / {copy.approval.kicker}
          </div>
          <h1 className="page-title">{copy.approval.title}</h1>
          <p className="page-copy">{copy.approval.copy}</p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
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

      {error ? <section className="error-box">{error}</section> : null}

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Approval review</div>
              <h2>Control checkpoint active</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>Requester</span>
              <strong>{environment?.created_by_email || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Affected environment</span>
              <strong>{environment?.name || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Plan summary</span>
              <strong>{planJob?.type || 'tofu.plan'} / {planJob?.status || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Approval state</span>
              <strong>{environment?.approval_status || '-'}</strong>
            </div>
          </div>
          <div className="stack-list" style={{ marginTop: 14 }}>
            {checkpoints.map((item) => (
              <div key={item.label} className="stack-row">
                <div>
                  <strong>{item.label}</strong>
                </div>
                <span className={`badge ${item.state === 'ok' ? 'badge-done' : 'badge-queued'}`}>{item.state}</span>
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
              <button onClick={() => run('approve', () => environments.approve(environmentId, { comment: approvalComment.trim() }))} disabled={busy !== null}>
                {busy === 'approve' ? copy.approval.approving : copy.approval.approveRequest}
              </button>
            ) : null}
            {canApply ? (
              <button
                onClick={() => run('apply', () => environments.apply(environmentId), { confirm: 'Queue apply from the approved plan?' })}
                disabled={busy !== null}
              >
                {busy === 'apply' ? copy.approval.applying : copy.approval.queueUpdate}
              </button>
            ) : null}
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Impact preview</div>
              <h2>Update / destroy posture</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>Downtime risk</span>
              <strong>{impact.downtime}</strong>
            </div>
            <div className="meta-item">
              <span>Blast radius</span>
              <strong>{impact.blastRadius}</strong>
            </div>
            <div className="meta-item">
              <span>Footprint</span>
              <strong>{impact.costDelta}</strong>
            </div>
          </div>
          <div className="field-group" style={{ marginTop: 14 }}>
            <div className="field-title">Destructive safeguards</div>
            <div className="stack-list">
              <div className="stack-row">
                <div>
                  <strong>Type environment name to enable destroy plan</strong>
                  <div className="row-meta">Required by both the UI and API before a destroy plan can be queued from this surface.</div>
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
                  run('destroy', () => environments.destroy(environmentId, {
                    confirmation_name: environment?.name || '',
                    comment: destroyComment.trim(),
                  }), {
                    confirm: `Queue destroy plan for ${environment?.name || environmentId}?`,
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
            <div className="section-kicker">Audit trail</div>
            <h2>Immutable approval timeline</h2>
          </div>
        </div>
        <div className="audit-list">
          {auditItems.map((item) => (
            <div className="audit-item" key={item.id}>
              <div className="detail-top" style={{ alignItems: 'center' }}>
                <strong>{item.action}</strong>
                <span className="badge badge-muted">{new Date(item.created_at).toLocaleString()}</span>
              </div>
              <div className="row-meta">{item.actor_email || 'system'}</div>
              {item.message ? <div style={{ marginTop: 6 }}>{item.message}</div> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
