import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { auth, jobs, Job, wsUrl } from '../api'

type WsEvent =
  | { type: 'log'; jobId: string; file?: string; message: string }
  | { type: 'status'; jobId: string; status: string; error?: string }
  | { type: 'error'; message: string }

export default function JobDetailPage() {
  const nav = useNavigate()
  const { id } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState<string>('')
  const [logs, setLogs] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const jobId = useMemo(() => id || '', [id])
  const wsRef = useRef<WebSocket | null>(null)

  async function loadJob() {
    setError(null)
    try {
      await auth.me()
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
    wsRef.current = ws

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
          setLogs((prev) => prev + msg.message)
        }
        if (msg.type === 'status' && msg.jobId === jobId) {
          setStatus(msg.status)
        }
        if (msg.type === 'error') {
          setError(msg.message)
        }
      } catch (e) {
        // ignore
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

  return (
    <div>
      <p>
        <Link to="/jobs">← Jobs</Link>
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Job {jobId}</h3>
        <button onClick={loadJob}>Refresh</button>
        <span style={{ marginLeft: 'auto', color: connected ? 'green' : '#999' }}>
          WS: {connected ? 'connected' : 'disconnected'}
        </span>
      </div>

      {error && <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>}

      <div style={{ marginTop: 8, marginBottom: 12 }}>
        <div>
          <b>Status:</b> {status}
        </div>
        {job?.type && (
          <div>
            <b>Type:</b> {job.type}
          </div>
        )}
        {job?.error && (
          <div>
            <b>Error:</b> <span style={{ color: 'crimson' }}>{job.error}</span>
          </div>
        )}
      </div>

      <h4>Logs</h4>
      <pre
        style={{
          border: '1px solid #ddd',
          padding: 12,
          background: '#111',
          color: '#eee',
          minHeight: 240,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
        }}
      >
        {logs || '(no logs yet)'}
      </pre>
    </div>
  )
}
