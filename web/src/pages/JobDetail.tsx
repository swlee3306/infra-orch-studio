import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { auth, jobs, Job, wsUrl } from '../api'
import StatusBadge from '../components/StatusBadge'

type WsEvent =
  | { type: 'log'; jobId: string; file?: string; message: string }
  | { type: 'status'; jobId: string; status: string; error?: string }
  | { type: 'error'; message: string }

type LogEntry = {
  id: string
  file?: string
  message: string
}

export default function JobDetailPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState<string>('')
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [applying, setApplying] = useState(false)

  const jobId = useMemo(() => id || '', [id])

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
      const j = await jobs.get(jobId)
      setJob(j)
      setStatus(j.status)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    loadJob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="shell">
      <div className="grid">
        <section className="panel">
          <div className="detail-top">
            <div>
              <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                <Link to="/jobs">← Jobs</Link>
              </p>
              <h2 style={{ margin: 0 }}>Job {jobId}</h2>
              <p className="helper" style={{ marginBottom: 0 }}>
                {viewer?.email || 'Unknown viewer'} {viewer?.is_admin ? '· admin' : '· operator'}
              </p>
            </div>
            <div className="detail-actions">
              <button onClick={loadJob}>Refresh</button>
              <span className={`badge ${connected ? 'badge-running' : 'badge-muted'}`}>
                WS: {connected ? 'connected' : 'disconnected'}
              </span>
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
                  {applying ? 'Applying...' : 'Apply plan'}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <div className="split">
          <section className="panel">
            <div className="grid-two">
              <div className="meta-item">
                <span>Status</span>
                <StatusBadge status={status} />
              </div>
              <div className="meta-item">
                <span>Type</span>
                <strong>{job?.type || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Template</span>
                <strong>{job?.template_name || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Source job</span>
                <strong>
                  {job?.source_job_id ? (
                    <Link to={`/jobs/${job.source_job_id}`}>{job.source_job_id.slice(0, 8)}</Link>
                  ) : (
                    '-'
                  )}
                </strong>
              </div>
            </div>

            <div className="grid-two" style={{ marginTop: 14 }}>
              <div className="meta-item">
                <span>Workdir</span>
                <strong>{job?.workdir || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Plan path</span>
                <strong>{job?.plan_path || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Created</span>
                <strong>{job?.created_at ? new Date(job.created_at).toLocaleString() : '-'}</strong>
              </div>
              <div className="meta-item">
                <span>Updated</span>
                <strong>{job?.updated_at ? new Date(job.updated_at).toLocaleString() : '-'}</strong>
              </div>
            </div>

            {env ? (
              <div className="field-group" style={{ marginTop: 14 }}>
                <div className="field-title">Environment summary</div>
                <div className="grid-two" style={{ marginTop: 10 }}>
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
                    <span className="muted">{env.network?.cidr || '-'}</span>
                  </div>
                  <div className="meta-item">
                    <span>Subnet</span>
                    <strong>{env.subnet?.name || '-'}</strong>
                    <span className="muted">{env.subnet?.cidr || '-'}</span>
                  </div>
                </div>
                <div className="grid-two" style={{ marginTop: 10 }}>
                  <div className="meta-item">
                    <span>Instances</span>
                    <strong>{env.instances?.length || 0}</strong>
                  </div>
                  <div className="meta-item">
                    <span>Security groups</span>
                    <strong>{env.security_groups?.length || 0}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {job?.error ? <div className="error-box" style={{ marginTop: 14 }}>Error: {job.error}</div> : null}
            {error ? <div className="error-box" style={{ marginTop: 14 }}>{error}</div> : null}
          </section>

          <section className="panel">
            <div className="detail-top" style={{ marginBottom: 12 }}>
              <div>
                <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
                  Execution log
                </p>
                <strong>Streamed via WebSocket and file tailing</strong>
              </div>
            </div>
            <div className="log-stream">
              {logs.length === 0 ? (
                <div className="muted">(no logs yet)</div>
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
      </div>
    </div>
  )
}
