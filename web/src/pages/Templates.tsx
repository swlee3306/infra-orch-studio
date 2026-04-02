import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, TemplateCatalogResponse, templates } from '../api'

export default function TemplatesPage() {
  const nav = useNavigate()
  const [catalog, setCatalog] = useState<TemplateCatalogResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      await auth.me()
    } catch {
      nav('/login')
      return
    }

    try {
      const nextCatalog = await templates.list()
      setCatalog(nextCatalog)
    } catch (err: any) {
      setError(err?.message || 'failed to load templates')
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">Template management / repo-backed source</div>
          <h1 className="page-title">OpenTofu template catalog</h1>
          <p className="page-copy">
            This surface reflects the committed template directories used by the renderer. It is intentionally repo-backed so operators can see what environment sets and modules are actually available.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
            Refresh
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>Environment templates</span>
          <strong>{catalog?.environment_sets.length || 0}</strong>
          <p>Template roots available for create, update, and destroy plans.</p>
        </article>
        <article className="metric-card">
          <span>Modules</span>
          <strong>{catalog?.modules.length || 0}</strong>
          <p>Shared modules linked by the environment templates.</p>
        </article>
        <article className="metric-card">
          <span>Templates root</span>
          <strong>{catalog?.templates_root || '-'}</strong>
          <p>Filesystem root read by the API for environment template sets.</p>
        </article>
        <article className="metric-card">
          <span>Modules root</span>
          <strong>{catalog?.modules_root || '-'}</strong>
          <p>Filesystem root read by the API for shared modules.</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">Environment sets</div>
              <h2>Template directories</h2>
            </div>
          </div>
          <div className="stack-list">
            {catalog?.environment_sets.length ? (
              catalog.environment_sets.map((item) => (
                <div key={item.name} className="stack-row">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="row-meta">{item.path}</div>
                    <div className="chip-row" style={{ marginTop: 10 }}>
                      {item.files.map((file) => (
                        <span className="badge badge-muted" key={file}>
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">No environment templates were found.</div>
            )}
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Usage posture</div>
              <h2>Operator notes</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-row">
              <div>
                <strong>Renderer-backed</strong>
                <div className="row-meta">The catalog mirrors the same directories used by runner workdir rendering.</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>Environment-first</strong>
                <div className="row-meta">Create and plan actions still start from environments. This page exposes the underlying template inventory.</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>Current limitation</strong>
                <div className="row-meta">The API lists templates but does not yet create, edit, or validate templates from the console.</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">Shared modules</div>
            <h2>Reusable infrastructure building blocks</h2>
          </div>
        </div>
        <div className="stack-list">
          {catalog?.modules.length ? (
            catalog.modules.map((item) => (
              <div key={item.name} className="stack-row">
                <div>
                  <strong>{item.name}</strong>
                  <div className="row-meta">{item.path}</div>
                  <div className="chip-row" style={{ marginTop: 10 }}>
                    {item.files.map((file) => (
                      <span className="badge badge-muted" key={file}>
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">No modules were found.</div>
          )}
        </div>
      </section>
    </div>
  )
}
