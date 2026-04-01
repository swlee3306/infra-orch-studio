import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, jobs, Job, User } from '../api'

export default function JobsPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<Job[]>([])
  const [viewer, setViewer] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      const res = await jobs.list(50)
      setItems(res.items)
      setViewer(res.viewer)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Jobs</h3>
        <button onClick={load}>Refresh</button>
        <div style={{ marginLeft: 'auto', color: '#555' }}>{viewer ? viewer.email : ''}</div>
      </div>

      {error && <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>}

      <ul>
        {items.map((j) => (
          <li key={j.id}>
            <Link to={`/jobs/${j.id}`}>{j.id}</Link> — {j.type} — {j.status}{' '}
            {j.error ? <span style={{ color: 'crimson' }}>({j.error})</span> : null}
          </li>
        ))}
      </ul>

      <p style={{ color: '#555' }}>
        Triggering create/plan/apply is intentionally minimal in this MVP. Use API endpoints directly or extend this page.
      </p>
    </div>
  )
}
