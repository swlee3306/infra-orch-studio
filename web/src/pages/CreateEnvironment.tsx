import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, environments, EnvironmentPlanReviewResponse, EnvironmentSpec, ProviderCatalog, ProviderConnection, providers, requestDrafts, RequestDraftResponse, TemplateDescriptor, templates } from '../api'
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
  const [providerItems, setProviderItems] = useState<ProviderConnection[]>([])
  const [providerName, setProviderName] = useState('')
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalog | null>(null)
  const [providerBusy, setProviderBusy] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
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
    if (!viewerReady) return
    providers
      .list()
      .then((res) => {
        setProviderItems(res.items)
        const preferred = res.default_cloud && res.items.some((item) => item.name === res.default_cloud) ? res.default_cloud : res.items[0]?.name || ''
        setProviderName(preferred)
      })
      .catch(() => {
        setProviderItems([])
        setProviderName('')
      })
  }, [viewerReady])

  useEffect(() => {
    if (!viewerReady || !providerName) return
    setProviderBusy(true)
    setProviderError(null)
    providers
      .resources(providerName)
      .then((catalog) => {
        setProviderCatalog(catalog)
      })
      .catch((err: any) => {
        setProviderCatalog(null)
        setProviderError(err?.message || 'failed to load provider resources')
      })
      .finally(() => setProviderBusy(false))
  }, [viewerReady, providerName])

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

  function displayDraftLine(value: string) {
    if (!ko) return value
    return value
      .replace('Custom wording was detected, but the draft still maps to the current basic template contract.', '커스텀 표현이 감지되었지만 현재 basic 템플릿 계약으로 초안을 구성했습니다.')
      .replace('Production-like wording detected. Validate blast radius and approval context carefully.', '운영 환경에 가까운 표현이 감지되었습니다. 영향 범위와 승인 맥락을 신중히 검토하세요.')
      .replace(/(\d+) instances were inferred\. Review capacity and blast radius before approval\./, '$1개 인스턴스를 추론했습니다. 승인 전에 용량과 영향 범위를 검토하세요.')
  }

  function displayReviewSignalLine(value: string) {
    if (!ko) return value
    return value
      .replace('Destroy operation', '삭제 작업')
      .replace('Large instance footprint', '큰 인스턴스 규모')
      .replace('Subnet capacity pressure', '서브넷 용량 압박')
      .replace('Security references missing', '보안 참조 누락')
      .replace('Security references inherited', '보안 참조 상속')
      .replace('Template-backed plan', '템플릿 기반 계획')
      .replace('This plan is destructive and will require an explicit confirmation before it should be approved.', '이 계획은 파괴적 작업이며 승인 전에 명시적 확인이 필요합니다.')
      .replace('No security groups are attached. Validate tenant baseline inheritance before apply.', '보안 그룹이 연결되어 있지 않습니다. 적용 전에 테넌트 기본 상속을 확인하세요.')
      .replace(' will be included in the resulting environment state.', ' 항목이 결과 환경 상태에 포함됩니다.')
      .replace(' will be rendered through the fixed template path.', ' 구성이 고정 템플릿 경로로 렌더링됩니다.')
      .replace('Network ', '네트워크 ')
      .replace(' and subnet ', ' / 서브넷 ')
  }

  function displayImpactLine(value?: string) {
    if (!value) return '-'
    if (!ko) return value
    return value
      .replace(/Estimated footprint includes (\d+) instances and (\d+) security references\./, '예상 자원 영향은 인스턴스 $1개와 보안 참조 $2개입니다.')
      .replace('Negative spend delta expected after destroy is applied.', '삭제 적용 후 비용이 감소할 것으로 예상됩니다.')
  }

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
              <div className="section-kicker">{ko ? '단계' : 'Steps'}</div>
              <h2>{copy.create.stepsTitle}</h2>
            </div>
            <span className="badge badge-muted">
              {Math.round(((step + 1) / steps.length) * 100)}% {ko ? '완료' : 'complete'}
            </span>
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
                        <span>{ko ? '환경' : 'Environment'}</span>
                        <strong>{requestDraft.spec.environment_name}</strong>
                      </div>
                      <div className="meta-item">
                        <span>{ko ? '테넌트' : 'Tenant'}</span>
                        <strong>{requestDraft.spec.tenant_name}</strong>
                      </div>
                      <div className="meta-item">
                        <span>{ko ? '템플릿' : 'Template'}</span>
                        <strong>{requestDraft.template_name}</strong>
                      </div>
                      <div className="meta-item">
                        <span>{ko ? '인스턴스' : 'Instances'}</span>
                        <strong>{requestDraft.spec.instances.reduce((acc, item) => acc + item.count, 0)}</strong>
                      </div>
                    </div>
                    <div className="grid-two">
                      <div className="note-card">
                        <strong>{copy.create.requestChat.assumptions}</strong>
                        <div className="stack-list" style={{ marginTop: 10 }}>
                          {requestDraft.assumptions.map((item) => (
                            <div key={item} className="stack-row">
                              <div className="row-meta">{displayDraftLine(item)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="note-card">
                        <strong>{copy.create.requestChat.warnings}</strong>
                        <div className="stack-list" style={{ marginTop: 10 }}>
                          {requestDraft.warnings.length ? requestDraft.warnings.map((item) => (
                            <div key={item} className="stack-row stack-row-danger">
                              <div className="row-meta">{displayDraftLine(item)}</div>
                            </div>
                          )) : <div className="row-meta">{copy.create.requestChat.noWarnings}</div>}
                        </div>
                      </div>
                    </div>
                    <div className="callout callout-info">
                      <strong>{copy.create.requestChat.nextStep}</strong>
                      <p style={{ margin: '6px 0 0' }}>{displayDraftLine(requestDraft.next_step)}</p>
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
                    <strong>{ko ? '템플릿 모드' : 'Template mode'}</strong>
                    <div className="row-meta">{ko ? '초기 계획에 서버 기반 환경 카탈로그와 기본 모듈을 사용합니다.' : 'Use the server-backed environment catalog and baseline modules for the initial plan.'}</div>
                  </div>
                  <span className="badge badge-muted">{ko ? '권장' : 'Preferred'}</span>
                </button>
                <button
                  type="button"
                  className={`stack-row stack-row-link wizard-mode-card ${templateMode === 'custom' ? 'stack-row-selected' : ''}`}
                  onClick={() => setTemplateMode('custom')}
                >
                  <div>
                    <strong>{ko ? '커스텀 모드' : 'Custom mode'}</strong>
                    <div className="row-meta">{ko ? '같은 렌더러 계약을 유지하되 목표 상태를 폼 입력으로 직접 구성합니다.' : 'Keep the same renderer contract, but drive the desired state directly from the form inputs.'}</div>
                  </div>
                  <span className="badge badge-muted">{ko ? '직접 입력' : 'Direct spec'}</span>
                </button>
              </div>
              <div className="stack-list">
                <div className="note-card">
                  <strong>{ko ? '공급자 연결' : 'Provider connection'}</strong>
                  <div className="row-meta" style={{ marginTop: 8 }}>
                    {ko ? '연결된 OpenStack 공급자를 선택하면 이미지/플레이버/네트워크 후보를 자동으로 불러옵니다.' : 'Select an OpenStack provider to auto-load image, flavor, and network options.'}
                  </div>
                  <label className="field" style={{ marginTop: 10 }}>
                    <span>{ko ? '공급자' : 'Provider'}</span>
                    <select value={providerName} onChange={(e) => setProviderName(e.target.value)}>
                      {providerItems.length === 0 ? <option value="">{ko ? '사용 가능한 공급자 없음' : 'No providers available'}</option> : null}
                      {providerItems.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="row-meta" style={{ marginTop: 8 }}>
                    {providerBusy ? (ko ? '공급자 자원을 불러오는 중...' : 'Loading provider resources...') : providerCatalog ? `${providerCatalog.images.length} images · ${providerCatalog.flavors.length} flavors · ${providerCatalog.networks.length} networks` : '-'}
                  </div>
                  {providerError ? <div className="error-box" style={{ marginTop: 10 }}>{summarizeOperatorError(providerError)}</div> : null}
                </div>
                {templateItems.length === 0 ? (
                  <div className="callout callout-warning">
                    <strong>{ko ? '템플릿 카탈로그가 비어 있습니다' : 'Template catalog is empty'}</strong>
                    <p style={{ margin: '6px 0 0' }}>
                      {ko
                        ? '서버가 환경 템플릿을 반환하지 않았습니다. 커스텀 모드로 진행할 수는 있지만 템플릿 세트가 준비되기 전까지 계획 실행은 차단됩니다.'
                        : 'The server did not return any environment templates. You can continue in custom mode, but plan execution will stay blocked until a template set is available.'}
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
            <EnvironmentSpecForm
              value={spec}
              onChange={setSpec}
              sections={stepSections[step]}
              errors={validation.fieldErrors}
              resourceHints={providerCatalog ? { images: providerCatalog.images, flavors: providerCatalog.flavors, networks: providerCatalog.networks, instances: providerCatalog.instances } : undefined}
            />
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
                          <strong>{displayReviewSignalLine(signal.label)}</strong>
                          <div className="row-meta">{displayReviewSignalLine(signal.detail)}</div>
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
                      <strong>{displayImpactLine(impact?.cost_delta)}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>{ko ? '템플릿' : 'Template'}</span>
                      <strong>{preview?.plan_job?.template_name || selectedTemplate}</strong>
                    </div>
                    <div className="meta-item wizard-review-meta">
                      <span>{ko ? '모드' : 'Mode'}</span>
                      <strong>{ko ? (templateMode === 'template' ? '템플릿' : '커스텀') : templateMode}</strong>
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
