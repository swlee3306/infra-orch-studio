import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, TemplateCatalogResponse, TemplateDetailResponse, TemplateValidation, templates } from '../api'
import { useI18n } from '../i18n'
import { summarizeOperatorError } from '../utils/uiCopy'

export default function TemplatesPage() {
  const nav = useNavigate()
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
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
  const selectedDescriptor = detail?.descriptor || null

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{copy.templates.kicker}</div>
          <h1 className="page-title">{copy.templates.title}</h1>
          <p className="page-copy">{copy.templates.copy}</p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
            {copy.templates.refresh}
          </button>
          <button className="ghost" onClick={validateSelected} disabled={!selected || busy !== null}>
            {busy === 'validate' ? copy.templates.validating : copy.templates.validateSelected}
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      {emptyCatalog ? (
        <section className="callout callout-warning">
          <strong>{ko ? '현재 서버에서 볼 수 있는 템플릿이 없습니다' : 'No templates are currently visible to the server'}</strong>
          <p style={{ margin: '6px 0 0' }}>
            {ko ? <>환경 템플릿은 <code>{catalog?.templates_root || '-'}</code>, 공용 모듈은 <code>{catalog?.modules_root || '-'}</code> 아래에 배치한 뒤 이 페이지를 새로고침하세요.</> : <>Place environment templates under <code>{catalog?.templates_root || '-'}</code> and shared modules under <code>{catalog?.modules_root || '-'}</code>, then refresh this page.</>}
          </p>
        </section>
      ) : null}

      <section className="stats-grid template-stats-grid">
        <article className="metric-card metric-card-primary">
          <span>{ko ? '환경 템플릿' : 'Environment templates'}</span>
          <strong>{catalog?.environment_sets.length || 0}</strong>
          <p>{ko ? '생성, 업데이트, 삭제 계획에 사용할 수 있는 템플릿 루트입니다.' : 'Template roots available for create, update, and destroy plans.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '모듈' : 'Modules'}</span>
          <strong>{catalog?.modules.length || 0}</strong>
          <p>{ko ? '환경 템플릿이 참조하는 공용 모듈입니다.' : 'Shared modules linked by the environment templates.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '카탈로그 상태' : 'Catalog posture'}</span>
          <strong>{emptyCatalog ? (ko ? '비어 있음' : 'Empty') : ko ? '표시 중' : 'Visible'}</strong>
          <p>{ko ? '이 콘솔에서 서버 측 템플릿 루트를 읽고 선택할 수 있는 상태입니다.' : 'Server-side template roots are readable and selectable from this console.'}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '환경 세트' : 'Environment sets'}</div>
              <h2>{ko ? '템플릿 디렉터리' : 'Template directories'}</h2>
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
                    <div className="row-meta">{item.description || (ko ? '생성, 업데이트, 삭제 계획에 사용할 수 있는 환경 세트입니다.' : 'Environment set visible to create, update, and destroy planning.')}</div>
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
              <div className="empty-state">{ko ? '설정된 서버 경로에서 환경 템플릿을 찾지 못했습니다.' : 'No environment templates were found in the configured server path.'}</div>
            )}
          </div>
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '런타임 가시성' : 'Runtime visibility'}</div>
              <h2>{ko ? '카탈로그 상태' : 'Catalog posture'}</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-row">
              <div>
                <strong>{ko ? '템플릿 루트' : 'Template root'}</strong>
                <div className="row-meta">{catalog?.templates_root || '-'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>{ko ? '모듈 루트' : 'Module root'}</strong>
                <div className="row-meta">{catalog?.modules_root || '-'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>{ko ? '운영자 가이드' : 'Operator guidance'}</strong>
                <div className="row-meta">{ko ? '템플릿 내용이 바뀌었을 때는 생성, 업데이트, 삭제 계획을 큐잉하기 전에 검증을 실행하세요.' : 'Use validation before queueing create, update, or destroy plans when template contents have changed.'}</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '검사' : 'Inspect'}</div>
              <h2>{ko ? '선택된 템플릿 상세' : 'Selected template detail'}</h2>
            </div>
          </div>
          {detail ? (
            <div className="page-stack">
              <div className="info-grid">
                <div className="meta-item">
                  <span>{ko ? '종류' : 'Kind'}</span>
                  <strong>{validation?.kind || selected?.kind || '-'}</strong>
                </div>
                <div className="meta-item">
                  <span>{ko ? '이름' : 'Name'}</span>
                  <strong>{detail.descriptor.name}</strong>
                </div>
                <div className="meta-item">
                  <span>{ko ? '경로' : 'Path'}</span>
                  <strong>{detail.descriptor.name}</strong>
                  <div className="row-meta">{detail.descriptor.path}</div>
                </div>
                <div className="meta-item">
                  <span>{ko ? '검증' : 'Validation'}</span>
                  <strong>{validation?.valid ? (ko ? '통과' : 'Pass') : ko ? '확인 필요' : 'Attention needed'}</strong>
                </div>
              </div>
              <div className="stack-list">
                <div className="stack-row">
                  <div>
                    <strong>{ko ? '설명' : 'Description'}</strong>
                    <div className="row-meta">{validation?.description || (ko ? '설명이 없습니다.' : 'No description available.')}</div>
                  </div>
                </div>
                {selectedDescriptor ? (
                  <details className="console-details console-details-inline">
                    <summary>{ko ? '선택된 경로 보기' : 'Show selected path'}</summary>
                    <div className="row-meta" style={{ marginTop: 10 }}>
                      {selectedDescriptor.path}
                    </div>
                  </details>
                ) : null}
                <div className="stack-row">
                  <div>
                    <strong>{ko ? '필수 파일' : 'Required files'}</strong>
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
                    {ko ? `누락 파일: ${validation.missing_files.join(', ')}` : `Missing files: ${validation.missing_files.join(', ')}`}
                  </div>
                ) : null}
                {validation?.warnings.length ? (
                  <div className="callout callout-warning">
                    <strong>{ko ? '경고' : 'Warnings'}</strong>
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
            <div className="empty-state">{busy === 'inspect' ? (ko ? '선택한 템플릿을 불러오는 중...' : 'Loading selected template...') : ko ? '검사할 템플릿 또는 모듈을 선택하세요.' : 'Choose a template or module to inspect.'}</div>
          )}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '상태' : 'Status'}</div>
              <h2>{ko ? '검증 상태' : 'Validation posture'}</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-row">
              <div>
                <strong>{ko ? '렌더러 계약' : 'Renderer contract'}</strong>
                <div className="row-meta">{ko ? '검증은 러너와 렌더링 파이프라인이 요구하는 파일을 확인합니다.' : 'Validation checks the files required by the runner and rendering pipeline.'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>{ko ? 'README 범위' : 'README coverage'}</strong>
                <div className="row-meta">{validation?.readme_exists ? (ko ? '운영자 가이드 파일이 있습니다.' : 'Operator guidance file is present.') : ko ? '선택한 항목에 README 가이드가 없습니다.' : 'README guidance is missing for the selected item.'}</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">{ko ? '공용 모듈' : 'Shared modules'}</div>
            <h2>{ko ? '재사용 가능한 인프라 구성 요소' : 'Reusable infrastructure building blocks'}</h2>
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
                  <div className="row-meta">{item.description || (ko ? '환경 세트에서 사용할 수 있는 재사용 가능한 인프라 구성 요소입니다.' : 'Reusable infrastructure building block available to environment sets.')}</div>
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
            <div className="empty-state">{ko ? '설정된 서버 경로에서 공용 모듈을 찾지 못했습니다.' : 'No shared modules were found in the configured server path.'}</div>
            )}
          </div>
      </section>
    </div>
  )
}
