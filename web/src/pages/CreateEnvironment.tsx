import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, environments, EnvironmentPlanReviewResponse, EnvironmentSpec, requestDrafts, RequestDraftResponse, TemplateDescriptor, templates } from '../api'
import EnvironmentSpecForm from '../components/EnvironmentSpecForm'
import { useI18n } from '../i18n'
import { emptyEnvironmentSpec, summarizeSpec } from '../utils/environmentView'
import { validateEnvironmentSpecForWizard } from '../utils/environmentValidation'
import { summarizeOperatorError } from '../utils/uiCopy'

const STORAGE_KEY = 'infra-orch:create-draft'

const stepSections: Record<number, Array<'environment' | 'tenant' | 'network' | 'instances' | 'security'>> = {
  1: ['tenant'],
  2: ['environment'],
  3: ['network'],
  4: ['instances'],
  5: ['security'],
}

export default function CreateEnvironmentPage() {
  const nav = useNavigate()
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
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
  const [chatPrompt, setChatPrompt] = useState('')
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [requestDraft, setRequestDraft] = useState<RequestDraftResponse | null>(null)
  const steps = copy.create.stepLabels

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

  async function generateRequestDraft() {
    setDraftBusy(true)
    setDraftError(null)
    try {
      const draft = await requestDrafts.generate(chatPrompt)
      setRequestDraft(draft)
    } catch (err: any) {
      setRequestDraft(null)
      setDraftError(err?.message || 'failed to generate request draft')
    } finally {
      setDraftBusy(false)
    }
  }

  function applyRequestDraft() {
    if (!requestDraft) return
    setSpec(requestDraft.spec)
    setSelectedTemplate(requestDraft.template_name || 'basic')
    setTemplateMode('template')
    setStep(1)
  }

  if (!viewerReady) return null

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{copy.create.kicker}</div>
          <h1 className="page-title">{copy.create.title}</h1>
          <p className="page-copy">{copy.create.copy}</p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={saveDraft} disabled={savingDraft}>
            {savingDraft ? copy.create.savingDraft : copy.create.saveDraft}
          </button>
          <Link to="/environments" className="ghost action-link action-link-button">
            {copy.create.exitWizard}
          </Link>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">Steps</div>
              <h2>{copy.create.stepsTitle}</h2>
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
              <div className="section-kicker">{copy.create.currentStep}</div>
              <h2>{steps[step]}</h2>
            </div>
          </div>
          {currentStepErrors.length > 0 ? (
            <div className="error-box">
              <strong>{copy.create.resolveBeforeContinue}</strong>
              <div>{currentStepErrors[0]}</div>
            </div>
          ) : null}

          {step === 0 ? (
            <div className="page-stack">
              <article className="console-card request-chat-card">
                <div className="section-head">
                  <div>
                    <div className="section-kicker">{copy.create.requestChat.kicker}</div>
                    <h2>{copy.create.requestChat.title}</h2>
                  </div>
                  <span className="badge badge-muted">{copy.create.requestChat.draftOnly}</span>
                </div>
                <p className="page-copy request-chat-copy">
                  {copy.create.requestChat.copy}
                </p>
                <label className="field">
                  <span>{copy.create.requestChat.promptLabel}</span>
                  <textarea
                    rows={4}
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    placeholder={copy.create.requestChat.promptPlaceholder}
                  />
                </label>
                <div className="detail-actions" style={{ marginTop: 14 }}>
                  <button type="button" onClick={generateRequestDraft} disabled={draftBusy || chatPrompt.trim() === ''}>
                    {draftBusy ? copy.create.requestChat.generating : copy.create.requestChat.generate}
                  </button>
                  {requestDraft ? (
                    <button type="button" className="ghost" onClick={applyRequestDraft}>
                      {copy.create.requestChat.useDraft}
                    </button>
                  ) : null}
                </div>
                {draftError ? <div className="error-box" style={{ marginTop: 14 }}>{summarizeOperatorError(draftError)}</div> : null}
                {requestDraft ? (
                  <div className="page-stack" style={{ marginTop: 16 }}>
                    <div className="info-grid wizard-review-summary">
                      <div className="meta-item">
                        <span>Environment</span>
                        <strong>{requestDraft.spec.environment_name}</strong>
                      </div>
                      <div className="meta-item">
                        <span>Tenant</span>
                        <strong>{requestDraft.spec.tenant_name}</strong>
                      </div>
                      <div className="meta-item">
                        <span>Template</span>
                        <strong>{requestDraft.template_name}</strong>
                      </div>
                      <div className="meta-item">
                        <span>Instances</span>
                        <strong>{requestDraft.spec.instances.reduce((acc, item) => acc + item.count, 0)}</strong>
                      </div>
                    </div>
                    <div className="grid-two">
                      <div className="note-card">
                        <strong>{copy.create.requestChat.assumptions}</strong>
                        <div className="stack-list" style={{ marginTop: 10 }}>
                          {requestDraft.assumptions.map((item) => (
                            <div key={item} className="stack-row">
                              <div className="row-meta">{item}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="note-card">
                        <strong>{copy.create.requestChat.warnings}</strong>
                        <div className="stack-list" style={{ marginTop: 10 }}>
                          {requestDraft.warnings.length ? requestDraft.warnings.map((item) => (
                            <div key={item} className="stack-row stack-row-danger">
                              <div className="row-meta">{item}</div>
                            </div>
                          )) : <div className="row-meta">{copy.create.requestChat.noWarnings}</div>}
                        </div>
                      </div>
                    </div>
                    <div className="callout callout-info">
                      <strong>{copy.create.requestChat.nextStep}</strong>
                      <p style={{ margin: '6px 0 0' }}>{requestDraft.next_step}</p>
                    </div>
                  </div>
                ) : null}
              </article>
              <div className="stack-list">
                <button
                  type="button"
                  className={`stack-row stack-row-link wizard-mode-card ${templateMode === 'template' ? 'stack-row-selected' : ''}`}
                  onClick={() => setTemplateMode('template')}
                >
                  <div>
                    <strong>Template mode</strong>
                    <div className="row-meta">Use the server-backed environment catalog and baseline modules for the initial plan.</div>
                  </div>
                  <span className="badge badge-muted">Preferred</span>
                </button>
                <button
                  type="button"
                  className={`stack-row stack-row-link wizard-mode-card ${templateMode === 'custom' ? 'stack-row-selected' : ''}`}
                  onClick={() => setTemplateMode('custom')}
                >
                  <div>
                    <strong>Custom mode</strong>
                    <div className="row-meta">Keep the same renderer contract, but drive the desired state directly from the form inputs.</div>
                  </div>
                  <span className="badge badge-muted">Direct spec</span>
                </button>
              </div>
              <div className="stack-list">
                {templateItems.length === 0 ? (
                  <div className="callout callout-warning">
                    <strong>Template catalog is empty</strong>
                    <p style={{ margin: '6px 0 0' }}>
                      The server did not return any environment templates. You can continue in custom mode, but plan execution will stay blocked until a template set is available.
                    </p>
                  </div>
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
                  <span>{ko ? '인스턴스' : 'Instances'}</span>
                  <strong>{summary.instanceTotal}</strong>
                  <p>{ko ? '현재 스펙에서 계산된 전체 요청 인스턴스 수입니다.' : 'Total requested instance count derived from the current spec.'}</p>
                </article>
                <article className="metric-card">
                  <span>{ko ? '보안 참조' : 'Security refs'}</span>
                  <strong>{summary.securityGroupTotal}</strong>
                  <p>{ko ? '계획에 포함될 보안 그룹 또는 상속 참조 수입니다.' : 'Security groups or inherited references carried into the plan.'}</p>
                </article>
                <article className="metric-card">
                  <span>{ko ? '다운타임 위험' : 'Downtime risk'}</span>
                  <strong>{impact?.downtime || (previewLoading ? (ko ? '불러오는 중...' : 'Loading...') : '-')}</strong>
                  <p>{ko ? '생성 후에도 같은 서버 측 검토 계약으로 계산한 운영 영향 추정입니다.' : 'Estimated operational disruption based on the same server-side review contract used after create.'}</p>
                </article>
              </div>
              {previewError ? <div className="error-box">{summarizeOperatorError(previewError)}</div> : null}
              <div className="dashboard-grid wizard-review-grid">
                <article className="console-card">
                  <div className="section-head">
                    <div>
                      <div className="section-kicker">{ko ? '검증 + 도움말' : 'Validation + help'}</div>
                      <h2>{ko ? '검토 신호' : 'Review signals'}</h2>
                    </div>
                  </div>
                  <div className="stack-list">
                    {previewLoading && reviewSignals.length === 0 ? <div className="empty-state">{ko ? '서버 측 검토 신호를 불러오는 중...' : 'Loading server-side review signals...'}</div> : null}
                    {!previewLoading && reviewSignals.length === 0 ? (
                      <div className="empty-state">{ko ? '이 목표 상태에 대한 검토 신호가 없습니다.' : 'No review signals were returned for this desired state.'}</div>
                    ) : null}
                    {reviewSignals.map((signal) => (
                      <div key={signal.label} className={`stack-row wizard-review-signal ${signal.severity === 'high' ? 'stack-row-danger' : ''}`}>
                        <div>
                          <strong>{signal.label}</strong>
                          <div className="row-meta">{signal.detail}</div>
                        </div>
                        <span className={`badge ${signal.severity === 'high' ? 'badge-failed' : signal.severity === 'medium' ? 'badge-queued' : 'badge-done'}`}>
                          {ko ? signal.severity === 'high' ? '높음' : signal.severity === 'medium' ? '중간' : '낮음' : signal.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="console-card">
                  <div className="section-head">
                    <div>
                      <div className="section-kicker">{ko ? '영향 요약' : 'Impact summary'}</div>
                      <h2>{ko ? '적용 전 상태' : 'Pre-apply posture'}</h2>
                    </div>
                  </div>
                  <div className="info-grid wizard-review-summary">
                    <div className="meta-item wizard-review-meta">
                      <span>{ko ? '영향 범위' : 'Blast radius'}</span>
                      <strong>{impact?.blast_radius || '-'}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>{ko ? '비용 / 용량' : 'Cost / capacity'}</span>
                      <strong>{impact?.cost_delta || '-'}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>{ko ? '템플릿' : 'Template'}</span>
                      <strong>{preview?.plan_job?.template_name || selectedTemplate}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>{ko ? '모드' : 'Mode'}</span>
                      <strong>{templateMode}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>{ko ? '입력 게이트' : 'Input gates'}</span>
                      <strong>{Object.keys(validation.fieldErrors).length === 0 ? (ko ? '정상' : 'Clear') : ko ? `문제 ${Object.keys(validation.fieldErrors).length}개` : `${Object.keys(validation.fieldErrors).length} issue(s)`}</strong>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          ) : null}

          <div className="detail-actions" style={{ marginTop: 16 }}>
            <button type="button" className="ghost" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
              {copy.create.back}
            </button>
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} disabled={currentStepBlocked}>
                {copy.create.continue}
              </button>
            ) : (
              <button
                type="button"
                onClick={createEnvironment}
                disabled={creating || previewLoading || !!previewError || Object.keys(validation.fieldErrors).length > 0}
              >
                {creating ? copy.create.queueingInitialPlan : previewLoading ? copy.create.refreshReview : previewError ? copy.create.fixReviewErrors : copy.create.queueInitialPlan}
              </button>
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
