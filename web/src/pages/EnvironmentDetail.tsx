import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuditEvent, auth, Environment, environments, Job, jobs } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import StatusBadge from '../components/StatusBadge'

function parseJson(value?: string): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function EnvironmentDetailPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [auditItems, setAuditItems] = useState<AuditEvent[]>([])
  const [lastJob, setLastJob] = useState<Job | null>(null)
  const [editingSpec, setEditingSpec] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const environmentId = useMemo(() => id || '', [id])
  const outputs = useMemo(() => parseJson(environment?.outputs_json), [environment?.outputs_json])

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
      const [env, audit] = await Promise.all([environments.get(environmentId), environments.audit(environmentId)])
      setEnvironment(env)
      setEditingSpec(env.spec)
      setAuditItems(audit.items)
      if (env.last_job_id) {
        const job = await jobs.get(env.last_job_id)
        setLastJob(job)
      } else {
        setLastJob(null)
      }
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    load()
  }, [environmentId])

  async function runAction(action: string, fn: () => Promise<any>) {
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

  const canPlanUpdate = Boolean(environment && editingSpec && busyAction === null)
  const canApprove = Boolean(viewer?.is_admin && environment?.status === 'pending_approval')
  const canApply = Boolean(viewer?.is_admin && environment?.approval_status === 'approved')
  const canRetry = Boolean(environment?.status === 'failed' && (environment.retry_count || 0) < (environment?.max_retries || 0))
  const canDestroy = Boolean(
    environment && !['destroyed', 'destroying', 'planning', 'applying'].includes(environment.status),
  )

  return (
    <div className="shell">
      <div className="grid">
        <section className="panel">
          <div className="detail-top">
            <div>
              <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                <Link to="/environments">← Environments</Link>
              </p>
              <h2 style={{ margin: 0 }}>{environment?.name || environmentId}</h2>
              <p className="helper" style={{ marginBottom: 0 }}>
                {viewer?.email || 'Unknown viewer'} {viewer?.is_admin ? '· admin' : '· operator'}
              </p>
            </div>
            <div className="detail-actions">
              <button onClick={load}>Refresh</button>
              <button
                className="ghost"
                disabled={!canPlanUpdate || busyAction !== null}
                onClick={() =>
                  runAction('update-plan', () => environments.plan(environmentId, editingSpec, 'update', 'basic'))
                }
              >
                {busyAction === 'update-plan' ? 'Queueing...' : 'Queue update plan'}
              </button>
              {canApprove ? (
                <button disabled={busyAction !== null} onClick={() => runAction('approve', () => environments.approve(environmentId))}>
                  {busyAction === 'approve' ? 'Approving...' : 'Approve'}
                </button>
              ) : null}
              {canApply ? (
                <button disabled={busyAction !== null} onClick={() => runAction('apply', () => environments.apply(environmentId))}>
                  {busyAction === 'apply' ? 'Applying...' : 'Apply approved plan'}
                </button>
              ) : null}
              {canRetry ? (
                <button className="ghost" disabled={busyAction !== null} onClick={() => runAction('retry', () => environments.retry(environmentId))}>
                  {busyAction === 'retry' ? 'Retrying...' : 'Retry failed step'}
                </button>
              ) : null}
              {canDestroy ? (
                <button className="ghost danger" disabled={busyAction !== null} onClick={() => runAction('destroy', () => environments.destroy(environmentId))}>
                  {busyAction === 'destroy' ? 'Queueing destroy...' : 'Queue destroy plan'}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <div className="split">
          <section className="panel">
            <div className="grid-three">
              <div className="meta-item">
                <span>Status</span>
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
                <span>Created by</span>
                <strong>{environment?.created_by_email || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Approved by</span>
                <strong>{environment?.approved_by_email || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Retries</span>
                <strong>
                  {environment?.retry_count || 0} / {environment?.max_retries || 0}
                </strong>
              </div>
              <div className="meta-item">
                <span>Workdir</span>
                <strong>{environment?.workdir || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Plan artifact</span>
                <strong>{environment?.plan_path || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Last execution</span>
                <strong>
                  {environment?.last_job_id ? <Link to={`/jobs/${environment.last_job_id}`}>{environment.last_job_id.slice(0, 8)}</Link> : '-'}
                </strong>
              </div>
            </div>

            {environment?.last_error ? <div className="error-box" style={{ marginTop: 14 }}>Last error: {environment.last_error}</div> : null}
            {error ? <div className="error-box" style={{ marginTop: 14 }}>{error}</div> : null}

            <div className="field-group" style={{ marginTop: 14 }}>
              <div className="field-title">Environment spec</div>
              {editingSpec ? <EnvironmentSpecForm value={editingSpec} onChange={setEditingSpec} /> : null}
            </div>
          </section>

          <div className="grid">
            <section className="panel">
              <div className="detail-top" style={{ marginBottom: 12 }}>
                <div>
                  <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                    Execution context
                  </p>
                  <strong>Current lifecycle state, latest job, and produced outputs.</strong>
                </div>
              </div>
              <div className="grid-two">
                <div className="meta-item">
                  <span>Latest job type</span>
                  <strong>{lastJob?.type || '-'}</strong>
                </div>
                <div className="meta-item">
                  <span>Latest job status</span>
                  <StatusBadge status={lastJob?.status || ''} />
                </div>
                <div className="meta-item">
                  <span>Requested by</span>
                  <strong>{lastJob?.requested_by || '-'}</strong>
                </div>
                <div className="meta-item">
                  <span>Last updated</span>
                  <strong>{lastJob?.updated_at ? new Date(lastJob.updated_at).toLocaleString() : '-'}</strong>
                </div>
              </div>

              {outputs ? (
                <div className="field-group" style={{ marginTop: 14 }}>
                  <div className="field-title">Outputs</div>
                  <pre className="json-block">{JSON.stringify(outputs, null, 2)}</pre>
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 14 }}>
                  No outputs recorded yet.
                </div>
              )}
            </section>

            <section className="panel">
              <div className="detail-top" style={{ marginBottom: 12 }}>
                <div>
                  <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                    Audit trail
                  </p>
                  <strong>Who requested, approved, retried, and destroyed each lifecycle step.</strong>
                </div>
              </div>
              <div className="audit-list">
                {auditItems.length === 0 ? (
                  <div className="muted">No audit events yet.</div>
                ) : (
                  auditItems.map((item) => {
                    const metadata = parseJson(item.metadata_json)
                    return (
                      <div className="audit-item" key={item.id}>
                        <div className="detail-top" style={{ alignItems: 'center' }}>
                          <strong>{item.action}</strong>
                          <span className="badge badge-muted">{new Date(item.created_at).toLocaleString()}</span>
                        </div>
                        <div className="muted">{item.actor_email || 'system'}</div>
                        {item.message ? <div style={{ marginTop: 6 }}>{item.message}</div> : null}
                        {metadata ? <pre className="json-block" style={{ marginTop: 10 }}>{JSON.stringify(metadata, null, 2)}</pre> : null}
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
