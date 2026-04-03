import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, environments, EnvironmentPlanReviewResponse, EnvironmentSpec, TemplateDescriptor, templates } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import { emptyEnvironmentSpec, summarizeSpec } from '../utils/environmentView'
import { validateEnvironmentSpecForWizard } from '../utils/environmentValidation'

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

const stepSections: Record<number, Array<'environment' | 'tenant' | 'network' | 'instances' | 'security'>> = {
  1: ['tenant'],
  2: ['environment'],
  3: ['network'],
  4: ['instances'],
  5: ['security'],
}

export default function CreateEnvironmentPage() {
  const nav = useNavigate()
  const [viewerReady, setViewerReady] = useState(false)
  const [step, setStep] = useState(0)
  const [spec, setSpec] = useState<EnvironmentSpec>(emptyEnvironmentSpec)
  const [templateMode, setTemplateMode] = useState<'template' | 'custom'>('template')
  const [templateItems, setTemplateItems] = useState<TemplateDescriptor[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('basic')
  const [error, setError] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [creating, setCreating] = useState(false)
  const [preview, setPreview] = useState<EnvironmentPlanReviewResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    auth
      .me()
      .then(() => setViewerReady(true))
      .catch(() => nav('/login'))
  }, [])

  useEffect(() => {
    if (!viewerReady) return
    templates
      .list()
      .then((catalog) => {
        setTemplateItems(catalog.environment_sets)
        if (catalog.environment_sets.length > 0) {
          setSelectedTemplate((current) =>
            catalog.environment_sets.some((item) => item.name === current) ? current : catalog.environment_sets[0].name,
          )
        }
      })
      .catch(() => {
        setTemplateItems([])
        setSelectedTemplate('basic')
      })
  }, [viewerReady])

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as {
        spec?: EnvironmentSpec
        templateMode?: 'template' | 'custom'
        selectedTemplate?: string
        step?: number
      }
      if (parsed.spec) setSpec(parsed.spec)
      if (parsed.templateMode) setTemplateMode(parsed.templateMode)
      if (parsed.selectedTemplate) setSelectedTemplate(parsed.selectedTemplate)
      if (typeof parsed.step === 'number') setStep(Math.max(0, Math.min(6, parsed.step)))
    } catch {
      // ignore malformed local draft
    }
  }, [])

  const summary = useMemo(() => summarizeSpec(spec), [spec])
  const validation = useMemo(() => validateEnvironmentSpecForWizard(spec), [spec])
  const currentStepErrors = validation.stepErrors[step] || []
  const currentStepBlocked = step !== 0 && currentStepErrors.length > 0
  const reviewSignals = preview?.review_signals || []
  const impact = preview?.impact_summary || null

  useEffect(() => {
    if (!viewerReady || step !== 6) return

    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)

    environments
      .previewPlanReview({
        spec,
        operation: 'create',
        template_name: selectedTemplate,
      })
      .then((response) => {
        if (cancelled) return
        setPreview(response)
      })
      .catch((err: any) => {
        if (cancelled) return
        setPreview(null)
        setPreviewError(err?.message || 'failed to load review preview')
      })
      .finally(() => {
        if (cancelled) return
        setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [viewerReady, step, spec, selectedTemplate])

  async function saveDraft() {
    setSavingDraft(true)
    setError(null)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ spec, templateMode, selectedTemplate, step }))
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
      const created = await environments.create(spec, selectedTemplate)
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
                  {index > 0 && validation.stepErrors[index]?.length ? (
                    <div className="row-meta wizard-step-warning">{validation.stepErrors[index][0]}</div>
                  ) : null}
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
          {currentStepErrors.length > 0 ? (
            <div className="error-box">
              <strong>Resolve before continuing</strong>
              <div>{currentStepErrors[0]}</div>
            </div>
          ) : null}

          {step === 0 ? (
            <div className="page-stack">
              <div className="dashboard-grid">
                <article className={`stack-row stack-row-link ${templateMode === 'template' ? 'stack-row-selected' : ''}`} onClick={() => setTemplateMode('template')}>
                  <div>
                    <strong>Template mode</strong>
                    <div className="row-meta">Uses a repo-backed environment set and baseline modules.</div>
                  </div>
                </article>
                <article className={`stack-row stack-row-link ${templateMode === 'custom' ? 'stack-row-selected' : ''}`} onClick={() => setTemplateMode('custom')}>
                  <div>
                    <strong>Custom mode</strong>
                    <div className="row-meta">Keeps the same template backend, but emphasizes direct desired-state control in the form.</div>
                  </div>
                </article>
              </div>
              <div className="stack-list">
                {templateItems.length === 0 ? (
                  <div className="empty-state">No template catalog entries were loaded.</div>
                ) : (
                  templateItems.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={`stack-row stack-row-link ${selectedTemplate === item.name ? 'stack-row-selected' : ''}`}
                      onClick={() => setSelectedTemplate(item.name)}
                    >
                      <div>
                        <strong>{item.name}</strong>
                        <div className="row-meta">{item.path}</div>
                        <div className="row-meta">{item.files.join(', ')}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid-two">
              <EnvironmentSpecForm value={spec} onChange={setSpec} sections={stepSections[step]} errors={validation.fieldErrors} />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid-two">
              <EnvironmentSpecForm value={spec} onChange={setSpec} sections={stepSections[step]} errors={validation.fieldErrors} />
            </div>
          ) : null}

          {step >= 3 && step <= 5 ? (
            <EnvironmentSpecForm value={spec} onChange={setSpec} sections={stepSections[step]} errors={validation.fieldErrors} />
          ) : null}

          {step === 6 ? (
            <div className="page-stack wizard-review">
              <div className="stats-grid wizard-review-metrics">
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
                  <strong>{impact?.downtime || (previewLoading ? 'Loading...' : '-')}</strong>
                  <p>Estimated operational disruption based on the same server-side review contract used after create.</p>
                </article>
              </div>
              {previewError ? <div className="error-box">{previewError}</div> : null}
              <div className="dashboard-grid wizard-review-grid">
                <article className="console-card">
                  <div className="section-head">
                    <div>
                      <div className="section-kicker">Validation + help</div>
                      <h2>Review signals</h2>
                    </div>
                  </div>
                  <div className="stack-list">
                    {previewLoading && reviewSignals.length === 0 ? <div className="empty-state">Loading server-side review signals...</div> : null}
                    {!previewLoading && reviewSignals.length === 0 ? (
                      <div className="empty-state">No review signals were returned for this desired state.</div>
                    ) : null}
                    {reviewSignals.map((signal) => (
                      <div key={signal.label} className={`stack-row wizard-review-signal ${signal.severity === 'high' ? 'stack-row-danger' : ''}`}>
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
                  <div className="info-grid wizard-review-summary">
                    <div className="meta-item wizard-review-meta">
                      <span>Blast radius</span>
                      <strong>{impact?.blast_radius || '-'}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>Cost / capacity</span>
                      <strong>{impact?.cost_delta || '-'}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>Template</span>
                      <strong>{preview?.plan_job?.template_name || selectedTemplate}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>Mode</span>
                      <strong>{templateMode}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>Input gates</span>
                      <strong>{Object.keys(validation.fieldErrors).length === 0 ? 'Clear' : `${Object.keys(validation.fieldErrors).length} issue(s)`}</strong>
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
              <button type="button" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} disabled={currentStepBlocked}>
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={createEnvironment}
                disabled={creating || previewLoading || !!previewError || Object.keys(validation.fieldErrors).length > 0}
              >
                {creating ? 'Queueing initial plan...' : previewLoading ? 'Refreshing review...' : previewError ? 'Fix review errors' : 'Review plan'}
              </button>
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
