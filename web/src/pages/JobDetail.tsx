import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { auth, jobs, Job, wsUrl } from '../api'
import StatusBadge from '../components/StatusBadge'
import { useI18n } from '../i18n'

type WsEvent =
  | { type: 'log'; jobId: string; file?: string; message: string }
  | { type: 'status'; jobId: string; status: string; error?: string }
  | { type: 'error'; message: string }

type LogEntry = {
  id: string
  file?: string
  message: string
}

function parseJson(value?: string): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function environmentRoute(job: Job | null): string | null {
  if (!job?.environment_id) return null
  if (job.status === 'done' && job.type === 'tofu.plan') return `/environments/${job.environment_id}/review`
  return `/environments/${job.environment_id}`
}

function approvalRoute(job: Job | null): string | null {
  if (!job?.environment_id) return null
  return `/environments/${job.environment_id}/approval`
}

export default function JobDetailPage() {
  const nav = useNavigate()
  const { copy } = useI18n()
  const { id } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState<string>('')
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [applying, setApplying] = useState(false)

  const jobId = useMemo(() => id || '', [id])
  const outputs = useMemo(() => parseJson(job?.outputs_json), [job?.outputs_json])
  const env = job?.environment as
    | {
        environment_name?: string
        tenant_name?: string
        network?: { name?: string; cidr?: string }
        subnet?: { name?: string; cidr?: string; gateway_ip?: string; enable_dhcp?: boolean }
        instances?: Array<{ name?: string; image?: string; flavor?: string; count?: number }>
        security_groups?: string[]
      }
    | undefined
  const envLink = environmentRoute(job)
  const controlLink = approvalRoute(job)

  async function loadJob() {
    setError(null)
    try {
      const me = await auth.me()
      setViewer(me)
    } catch {
      nav('/login')
      return
    }

    if (!jobId) return
    try {
      const nextJob = await jobs.get(jobId)
      setJob(nextJob)
      setStatus(nextJob.status)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    loadJob()
  }, [jobId])

  useEffect(() => {
    if (!jobId) return

    const ws = new WebSocket(wsUrl())

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'subscribe', jobId }))
    }
    ws.onclose = () => {
      setConnected(false)
    }
    ws.onerror = () => {
      setConnected(false)
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsEvent
        if (msg.type === 'log' && msg.jobId === jobId) {
          setLogs((prev) =>
            prev.concat({
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              file: msg.file,
              message: msg.message,
            }),
          )
        }
        if (msg.type === 'status' && msg.jobId === jobId) {
          setStatus(msg.status)
          setJob((prev) => (prev ? { ...prev, status: msg.status, error: msg.error ?? prev.error } : prev))
        }
        if (msg.type === 'error') {
          setError(msg.message)
        }
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }, [jobId])

  const canApply = Boolean(viewer?.is_admin && job?.type === 'tofu.plan' && job.status === 'done' && job.plan_path && job.workdir)
  const canOpenControl = Boolean(job?.environment_id && (job.status === 'done' || job.status === 'failed'))

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">
            <Link to="/jobs" className="text-link">
              Executions
            </Link>{' '}
            / {copy.jobDetail.kicker}
          </div>
          <h1 className="page-title">{copy.jobDetail.title} / {jobId.slice(0, 8) || 'job'}</h1>
          <p className="page-copy">{copy.jobDetail.copy}</p>
        </div>
        <div className="hero-actions">
          <span className="badge badge-muted">{copy.jobDetail.viewer}: {viewer?.email || 'loading...'}</span>
          <span className={`badge ${connected ? 'badge-running' : 'badge-muted'}`}>WS: {connected ? copy.jobDetail.wsConnected : copy.jobDetail.wsOffline}</span>
          <button className="ghost" onClick={loadJob}>
            {copy.jobDetail.refresh}
          </button>
          {envLink ? (
            <Link to={envLink} className="ghost action-link action-link-button">
              {copy.jobDetail.environment}
            </Link>
          ) : null}
          {canOpenControl && controlLink ? (
            <Link to={controlLink} className="ghost action-link action-link-button">
              {copy.jobDetail.approvalControl}
            </Link>
          ) : null}
          {canApply ? (
            <button
              disabled={applying}
              onClick={async () => {
                if (!job) return
                setApplying(true)
                setError(null)
                try {
                  const created = await jobs.apply(job.id)
                  nav(`/jobs/${created.id}`)
                } catch (err: any) {
                  setError(err?.message || 'failed to create apply job')
                } finally {
                  setApplying(false)
                }
              }}
            >
              {applying ? copy.jobDetail.applying : copy.jobDetail.applyPlan}
            </button>
          ) : null}
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>Status</span>
          <strong>{status || '-'}</strong>
          <p>Current execution state for this job record.</p>
        </article>
        <article className="metric-card">
          <span>Operation</span>
          <strong>{job?.operation || 'plan/apply'}</strong>
          <p>Lifecycle mutation associated with this execution.</p>
        </article>
        <article className="metric-card">
          <span>Retry budget</span>
          <strong>
            {job?.retry_count || 0} / {job?.max_retries || 0}
          </strong>
          <p>Retry counters attached to the execution ledger.</p>
        </article>
        <article className="metric-card">
          <span>Template</span>
          <strong>{job?.template_name || '-'}</strong>
          <p>Fixed template path used by the renderer for this job.</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">Execution metadata</div>
              <h2>Chain, source, and linked environment</h2>
            </div>
          </div>
          <div className="info-grid info-grid-three">
            <div className="meta-item">
              <span>Job ID</span>
              <strong>{job?.id || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Type</span>
              <strong>{job?.type || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Status</span>
              <StatusBadge status={status} />
            </div>
            <div className="meta-item">
              <span>Source job</span>
              <strong>
                {job?.source_job_id ? <Link to={`/jobs/${job.source_job_id}`} className="text-link">{job.source_job_id.slice(0, 8)}</Link> : '-'}
              </strong>
            </div>
            <div className="meta-item">
              <span>Environment ID</span>
              <strong>
                {job?.environment_id && envLink ? <Link to={envLink} className="text-link">{job.environment_id}</Link> : job?.environment_id || '-'}
              </strong>
            </div>
            <div className="meta-item">
              <span>Requested by</span>
              <strong>{job?.requested_by || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Created</span>
              <strong>{job?.created_at ? new Date(job.created_at).toLocaleString() : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Updated</span>
              <strong>{job?.updated_at ? new Date(job.updated_at).toLocaleString() : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>Template</span>
              <strong>{job?.template_name || '-'}</strong>
            </div>
          </div>
          {job?.error ? <div className="error-box" style={{ marginTop: 14 }}>Error: {job.error}</div> : null}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Next action</div>
              <h2>Operator guidance</h2>
            </div>
          </div>
          <div className="stack-list">
            {envLink ? (
              <Link to={envLink} className="stack-row stack-row-link">
                <div>
                  <strong>Open linked environment</strong>
                  <div className="row-meta">Return to the environment record for lifecycle history and guarded actions.</div>
                </div>
              </Link>
            ) : null}
            {canApply ? (
              <div className="stack-row">
                <div>
                  <strong>Plan is ready to apply</strong>
                  <div className="row-meta">This plan finished successfully and has artifact pointers needed for apply.</div>
                </div>
              </div>
            ) : null}
            {canOpenControl && controlLink ? (
              <Link to={controlLink} className="stack-row stack-row-link">
                <div>
                  <strong>Open guarded control</strong>
                  <div className="row-meta">Approve, apply, or destroy from the dedicated environment mutation surface.</div>
                </div>
              </Link>
            ) : null}
            <div className="stack-row">
              <div>
                <strong>Inspect live logs</strong>
                <div className="row-meta">Use the stream below while the runner is connected. Historical file retrieval is not exposed yet.</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Environment payload</div>
              <h2>Rendered desired state summary</h2>
            </div>
          </div>
          {env ? (
            <div className="info-grid">
              <div className="meta-item">
                <span>Name</span>
                <strong>{env.environment_name || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Tenant</span>
                <strong>{env.tenant_name || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Network</span>
                <strong>{env.network?.name || '-'}</strong>
                <div className="row-meta">{env.network?.cidr || '-'}</div>
              </div>
              <div className="meta-item">
                <span>Subnet</span>
                <strong>{env.subnet?.name || '-'}</strong>
                <div className="row-meta">{env.subnet?.cidr || '-'}</div>
              </div>
              <div className="meta-item">
                <span>Instances</span>
                <strong>{env.instances?.reduce((sum, item) => sum + (item.count || 0), 0) || 0}</strong>
              </div>
              <div className="meta-item">
                <span>Security groups</span>
                <strong>{env.security_groups?.length || 0}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">No environment payload is attached to this job.</div>
          )}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Artifacts</div>
              <h2>Workdir and result pointers</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-row">
              <div>
                <strong>Workdir</strong>
                <div className="row-meta">{job?.workdir || '-'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>Plan path</strong>
                <div className="row-meta">{job?.plan_path || '-'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>Log directory</strong>
                <div className="row-meta">{job?.log_dir || '-'}</div>
              </div>
            </div>
          </div>
          {outputs ? (
            <pre className="json-block" style={{ marginTop: 14 }}>
              {JSON.stringify(outputs, null, 2)}
            </pre>
          ) : (
            <div className="empty-state" style={{ marginTop: 14 }}>
              No structured outputs were recorded for this execution.
            </div>
          )}
        </article>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">Live execution log</div>
            <h2>WebSocket stream</h2>
          </div>
          <span className={`badge ${connected ? 'badge-running' : 'badge-muted'}`}>{connected ? 'tailing live' : 'waiting for stream'}</span>
        </div>
        <div className="log-stream">
          {logs.length === 0 ? (
            <div className="empty-state">No streamed logs yet. Historical log download is not exposed by the current API.</div>
          ) : (
            logs.map((entry) => (
              <div className="log-entry" key={entry.id}>
                <div className="log-meta">
                  <span className="log-file">{entry.file || 'stdout'}</span>
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{entry.message}</pre>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
