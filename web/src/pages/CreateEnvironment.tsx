import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, environments, EnvironmentSpec } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import { buildImpactSummary, buildReviewSignals, emptyEnvironmentSpec, summarizeSpec } from '../utils/environmentView'

const STORAGE_KEY = 'infra-orch:create-draft'

const steps = [
  'Template / Custom',
  'Tenant',
  'Name',
  'Network / Subnet',
  'Instances',
  'Security Refs',
  'Validate + Review',
]

export default function CreateEnvironmentPage() {
  const nav = useNavigate()
  const [viewerReady, setViewerReady] = useState(false)
  const [step, setStep] = useState(0)
  const [spec, setSpec] = useState<EnvironmentSpec>(emptyEnvironmentSpec)
  const [templateMode, setTemplateMode] = useState<'template' | 'custom'>('template')
  const [error, setError] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    auth
      .me()
      .then(() => setViewerReady(true))
      .catch(() => nav('/login'))
  }, [])

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as { spec?: EnvironmentSpec; templateMode?: 'template' | 'custom'; step?: number }
      if (parsed.spec) setSpec(parsed.spec)
      if (parsed.templateMode) setTemplateMode(parsed.templateMode)
      if (typeof parsed.step === 'number') setStep(Math.max(0, Math.min(6, parsed.step)))
    } catch {
      // ignore malformed local draft
    }
  }, [])

  const summary = useMemo(() => summarizeSpec(spec), [spec])
  const reviewSignals = useMemo(() => buildReviewSignals(spec, 'create'), [spec])
  const impact = useMemo(() => buildImpactSummary(spec, 'create'), [spec])

  async function saveDraft() {
    setSavingDraft(true)
    setError(null)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ spec, templateMode, step }))
    } catch (err: any) {
      setError(err?.message || 'failed to save local draft')
    } finally {
      setSavingDraft(false)
    }
  }

  async function createEnvironment() {
    setCreating(true)
    setError(null)
    try {
      const created = await environments.create(spec, 'basic')
      window.localStorage.removeItem(STORAGE_KEY)
      nav(`/environments/${created.environment.id}/review`)
    } catch (err: any) {
      setError(err?.message || 'failed to create environment')
    } finally {
      setCreating(false)
    }
  }

  if (!viewerReady) return null

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">Environment setup / 07 steps</div>
          <h1 className="page-title">Create environment flow</h1>
          <p className="page-copy">
            Work through the desired-state inputs, persist a local draft when needed, then queue the initial plan and continue into review.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={saveDraft} disabled={savingDraft}>
            {savingDraft ? 'Saving draft...' : 'Save draft'}
          </button>
          <Link to="/environments" className="ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
            Exit wizard
          </Link>
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Steps</div>
              <h2>Wizard progress</h2>
            </div>
            <span className="badge badge-muted">{Math.round(((step + 1) / steps.length) * 100)}% complete</span>
          </div>
          <div className="stack-list">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                className={`stack-row stack-row-link ${index === step ? 'stack-row-selected' : ''}`}
                onClick={() => setStep(index)}
              >
                <div>
                  <strong>
                    {String(index + 1).padStart(2, '0')} {label}
                  </strong>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">Current step</div>
              <h2>{steps[step]}</h2>
            </div>
          </div>

          {step === 0 ? (
            <div className="dashboard-grid">
              <article className={`stack-row stack-row-link ${templateMode === 'template' ? 'stack-row-selected' : ''}`} onClick={() => setTemplateMode('template')}>
                <div>
                  <strong>Template mode</strong>
                  <div className="row-meta">Uses baseline modules and secure defaults.</div>
                </div>
              </article>
              <article className={`stack-row stack-row-link ${templateMode === 'custom' ? 'stack-row-selected' : ''}`} onClick={() => setTemplateMode('custom')}>
                <div>
                  <strong>Custom mode</strong>
                  <div className="row-meta">Full control for networking and instance mix within the current API contract.</div>
                </div>
              </article>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid-two">
              <label className="field">
                <span>Tenant</span>
                <input value={spec.tenant_name} onChange={(e) => setSpec({ ...spec, tenant_name: e.target.value })} />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid-two">
              <label className="field">
                <span>Environment name</span>
                <input value={spec.environment_name} onChange={(e) => setSpec({ ...spec, environment_name: e.target.value })} />
              </label>
            </div>
          ) : null}

          {step >= 3 && step <= 5 ? <EnvironmentSpecForm value={spec} onChange={setSpec} /> : null}

          {step === 6 ? (
            <div className="page-stack">
              <div className="stats-grid">
                <article className="metric-card metric-card-primary">
                  <span>Instances</span>
                  <strong>{summary.instanceTotal}</strong>
                  <p>Total requested instance count derived from the current spec.</p>
                </article>
                <article className="metric-card">
                  <span>Security refs</span>
                  <strong>{summary.securityGroupTotal}</strong>
                  <p>Security groups or inherited references carried into the plan.</p>
                </article>
                <article className="metric-card">
                  <span>Downtime risk</span>
                  <strong>{impact.downtime}</strong>
                  <p>Estimated operational disruption based on current desired-state shape.</p>
                </article>
              </div>
              <div className="dashboard-grid">
                <article className="console-card">
                  <div className="section-head">
                    <div>
                      <div className="section-kicker">Validation + help</div>
                      <h2>Review signals</h2>
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
                      <h2>Pre-apply posture</h2>
                    </div>
                  </div>
                  <div className="info-grid">
                    <div className="meta-item">
                      <span>Blast radius</span>
                      <strong>{impact.blastRadius}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Cost / capacity</span>
                      <strong>{impact.costDelta}</strong>
                    </div>
                    <div className="meta-item">
                      <span>Mode</span>
                      <strong>{templateMode}</strong>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          ) : null}

          <div className="detail-actions" style={{ marginTop: 16 }}>
            <button type="button" className="ghost" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
              Back
            </button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>
                Continue
              </button>
            ) : (
              <button type="button" onClick={createEnvironment} disabled={creating}>
                {creating ? 'Queueing initial plan...' : 'Review plan'}
              </button>
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
