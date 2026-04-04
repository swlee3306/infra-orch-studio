import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, TemplateCatalogResponse, TemplateDetailResponse, TemplateValidation, templates } from '../api'
import { summarizeOperatorError } from '../utils/uiCopy'

export default function TemplatesPage() {
  const nav = useNavigate()
  const [catalog, setCatalog] = useState<TemplateCatalogResponse | null>(null)
  const [selected, setSelected] = useState<{ kind: 'environment' | 'module'; name: string } | null>(null)
  const [detail, setDetail] = useState<TemplateDetailResponse | null>(null)
  const [validation, setValidation] = useState<TemplateValidation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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
      if (!selected && nextCatalog.environment_sets.length > 0) {
        setSelected({ kind: 'environment', name: nextCatalog.environment_sets[0].name })
      }
    } catch (err: any) {
      setError(err?.message || 'failed to load templates')
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!selected) return
    setBusy('inspect')
    setError(null)
    templates
      .get(selected.kind, selected.name)
      .then((response) => {
        setDetail(response)
        setValidation(response.validation)
      })
      .catch((err: any) => {
        setDetail(null)
        setValidation(null)
        setError(err?.message || 'failed to inspect template')
      })
      .finally(() => setBusy(null))
  }, [selected?.kind, selected?.name])

  async function validateSelected() {
    if (!selected) return
    setBusy('validate')
    setError(null)
    try {
      const result = await templates.validate(selected.kind, selected.name)
      setValidation(result)
    } catch (err: any) {
      setError(err?.message || 'failed to validate template')
    } finally {
      setBusy(null)
    }
  }

  const emptyCatalog = Boolean(catalog && catalog.environment_sets.length === 0 && catalog.modules.length === 0)

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">Template management / repo-backed source</div>
          <h1 className="page-title">OpenTofu template catalog</h1>
          <p className="page-copy">
            Inspect the template inventory currently visible to the API and runner before queuing create, update, or destroy plans.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
            Refresh
          </button>
          <button className="ghost" onClick={validateSelected} disabled={!selected || busy !== null}>
            {busy === 'validate' ? 'Validating...' : 'Validate selected'}
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      {emptyCatalog ? (
        <section className="callout callout-warning">
          <strong>No templates are currently visible to the server</strong>
          <p style={{ margin: '6px 0 0' }}>
            Place environment templates under <code>{catalog?.templates_root || '-'}</code> and shared modules under <code>{catalog?.modules_root || '-'}</code>, then refresh this page.
          </p>
        </section>
      ) : null}

      <section className="stats-grid template-stats-grid">
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
          <div className="metric-path">{catalog?.templates_root || '-'}</div>
          <p>Filesystem root read by the API for environment template sets.</p>
        </article>
        <article className="metric-card">
          <span>Modules root</span>
          <div className="metric-path">{catalog?.modules_root || '-'}</div>
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
                <button
                  key={item.name}
                  type="button"
                  className={`stack-row stack-row-link ${selected?.kind === 'environment' && selected.name === item.name ? 'stack-row-selected' : ''}`}
                  onClick={() => setSelected({ kind: 'environment', name: item.name })}
                >
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
                </button>
              ))
            ) : (
              <div className="empty-state">No environment templates were found in the configured server path.</div>
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
                <strong>Validation support</strong>
                <div className="row-meta">The console can now inspect required files and validate the selected template or module against renderer expectations.</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Inspect</div>
              <h2>Selected template detail</h2>
            </div>
          </div>
          {detail ? (
            <div className="page-stack">
              <div className="info-grid">
                <div className="meta-item">
                  <span>Kind</span>
                  <strong>{validation?.kind || selected?.kind || '-'}</strong>
                </div>
                <div className="meta-item">
                  <span>Name</span>
                  <strong>{detail.descriptor.name}</strong>
                </div>
                <div className="meta-item">
                  <span>Path</span>
                  <strong>{detail.descriptor.path}</strong>
                </div>
                <div className="meta-item">
                  <span>Validation</span>
                  <strong>{validation?.valid ? 'Pass' : 'Attention needed'}</strong>
                </div>
              </div>
              <div className="stack-list">
                <div className="stack-row">
                  <div>
                    <strong>Description</strong>
                    <div className="row-meta">{validation?.description || 'No description available.'}</div>
                  </div>
                </div>
                <div className="stack-row">
                  <div>
                    <strong>Required files</strong>
                    <div className="chip-row" style={{ marginTop: 10 }}>
                      {validation?.required_files.map((file) => (
                        <span className="badge badge-muted" key={file}>
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {validation?.missing_files.length ? (
                  <div className="error-box">
                    Missing files: {validation.missing_files.join(', ')}
                  </div>
                ) : null}
                {validation?.warnings.length ? (
                  <div className="callout callout-warning">
                    <strong>Warnings</strong>
                    {validation.warnings.map((item) => (
                      <p key={item} style={{ margin: '6px 0 0' }}>
                        {item}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="empty-state">{busy === 'inspect' ? 'Loading selected template...' : 'Choose a template or module to inspect.'}</div>
          )}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Status</div>
              <h2>Validation posture</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-row">
              <div>
                <strong>Renderer contract</strong>
                <div className="row-meta">Validation checks the files required by the runner and rendering pipeline.</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>README coverage</strong>
                <div className="row-meta">{validation?.readme_exists ? 'Operator guidance file is present.' : 'README guidance is missing for the selected item.'}</div>
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
              <button
                key={item.name}
                type="button"
                className={`stack-row stack-row-link ${selected?.kind === 'module' && selected.name === item.name ? 'stack-row-selected' : ''}`}
                onClick={() => setSelected({ kind: 'module', name: item.name })}
              >
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
              </button>
            ))
          ) : (
            <div className="empty-state">No shared modules were found in the configured server path.</div>
          )}
        </div>
      </section>
    </div>
  )
}
