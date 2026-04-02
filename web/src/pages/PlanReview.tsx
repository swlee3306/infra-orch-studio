import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuditEvent, auth, Environment, environments, Job } from '../api'
import { buildImpactSummary, buildReviewSignals, findLatestPlanJob, latestApprovalEvent } from '../utils/environmentView'
import StatusBadge from '../components/StatusBadge'

export default function PlanReviewPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [auditItems, setAuditItems] = useState<AuditEvent[]>([])
  const [jobItems, setJobItems] = useState<Job[]>([])
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
      const [env, audit, environmentJobs] = await Promise.all([
        environments.get(environmentId),
        environments.audit(environmentId),
        environments.jobs(environmentId),
      ])
      setEnvironment(env)
      setAuditItems(audit.items)
      setJobItems(environmentJobs.items)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    load()
  }, [environmentId])

  const planJob = useMemo(() => findLatestPlanJob(environment, jobItems), [environment, jobItems])
  const reviewSignals = useMemo(() => buildReviewSignals(environment?.spec || { environment_name: '', tenant_name: '', network: { name: '', cidr: '' }, subnet: { name: '', cidr: '', enable_dhcp: true }, instances: [] }, environment?.operation || 'create'), [environment])
  const impact = useMemo(() => buildImpactSummary(environment?.spec || { environment_name: '', tenant_name: '', network: { name: '', cidr: '' }, subnet: { name: '', cidr: '', enable_dhcp: true }, instances: [] }, environment?.operation || 'create'), [environment])
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
            / Plan review
          </div>
          <h1 className="page-title">Change evaluation / pre-apply</h1>
          <p className="page-copy">
            Review the latest environment plan, inspect inferred risk signals, and clear the approval gate only when the plan and impact look acceptable.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
            Refresh
          </button>
          {environment ? (
            <Link to={`/environments/${environment.id}/approval`} className="ghost action-link">
              Approval control
            </Link>
          ) : null}
          {environment ? (
            <Link to={`/environments/${environment.id}`} className="ghost action-link">
              Environment detail
            </Link>
          ) : null}
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>Plan status</span>
          <strong>{planJob?.status || 'missing'}</strong>
          <p>Current status of the latest queued plan job for this environment.</p>
        </article>
        <article className="metric-card">
          <span>High-risk</span>
          <strong>{reviewSignals.filter((item) => item.severity === 'high').length}</strong>
          <p>Inferred changes that require deliberate operator review.</p>
        </article>
        <article className="metric-card">
          <span>Low / medium</span>
          <strong>{reviewSignals.filter((item) => item.severity !== 'high').length}</strong>
          <p>Informational or cautionary changes associated with this desired state.</p>
        </article>
        <article className="metric-card">
          <span>Approval</span>
          <strong>{environment?.approval_status || '-'}</strong>
          <p>Approval state tracked on the environment resource.</p>
        </article>
        <article className="metric-card">
          <span>Template</span>
          <strong>{planJob?.template_name || 'basic'}</strong>
          <p>Template set used to render the current plan artifact.</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Plan review</div>
              <h2>Low-risk and high-risk signals</h2>
            </div>
          </div>
          <div className="stack-list">
            {reviewSignals.map((signal) => (
              <div key={signal.label} className={`stack-row ${signal.severity === 'high' ? 'stack-row-danger' : ''}`}>
                <div>
                  <strong>{signal.label}</strong>
                  <div className="row-meta">{signal.detail}</div>
                </div>
                <span className={`badge ${signal.severity === 'high' ? 'badge-failed' : signal.severity === 'medium' ? 'badge-queued' : 'badge-done'}`}>
                  {signal.severity}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Impact summary</div>
              <h2>Operational posture</h2>
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
            <div className="meta-item">
              <span>Plan artifact</span>
              <strong>{planJob?.plan_path || environment?.plan_path || '-'}</strong>
            </div>
          </div>
          <label className="checkbox" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>I reviewed all high-risk changes and warnings before approval.</span>
          </label>
          <label className="field" style={{ marginTop: 14 }}>
            <span>Approval comment</span>
            <textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder="Approval rationale, CAB reference, or operational note"
              rows={3}
            />
          </label>
          <div className="detail-actions" style={{ marginTop: 14 }}>
            {viewer?.is_admin && environment?.status === 'pending_approval' ? (
              <button onClick={() => run('approve', () => environments.approve(environmentId, { comment: approvalComment.trim() }))} disabled={!ack || busy !== null}>
                {busy === 'approve' ? 'Approving...' : 'Approve'}
              </button>
            ) : null}
            {viewer?.is_admin && environment?.approval_status === 'approved' ? (
              <button onClick={() => run('apply', () => environments.apply(environmentId))} disabled={!ack || busy !== null}>
                {busy === 'apply' ? 'Applying...' : 'Apply'}
              </button>
            ) : null}
            {environment?.approval_status === 'approved' ? (
              <Link to={`/environments/${environment.id}/approval`} className="ghost action-link">
                Open guarded control
              </Link>
            ) : null}
          </div>
        </article>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">Approval controls</div>
            <h2>Review status</h2>
          </div>
        </div>
        <div className="info-grid info-grid-three">
          <div className="meta-item">
            <span>Environment</span>
            <strong>{environment?.name || '-'}</strong>
          </div>
          <div className="meta-item">
            <span>Plan job</span>
            <strong>{planJob?.id ? planJob.id.slice(0, 8) : '-'}</strong>
          </div>
          <div className="meta-item">
            <span>Last approval event</span>
            <strong>{approvalEvent ? new Date(approvalEvent.created_at).toLocaleString() : 'Not yet approved'}</strong>
          </div>
        </div>
      </section>
    </div>
  )
}
