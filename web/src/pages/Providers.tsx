import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, ProviderConnection, ProviderListResponse, ProviderPreflight, providers } from '../api'
import { useI18n } from '../i18n'
import { isSafeProviderName } from '../utils/providerNames'
import { summarizeOperatorError } from '../utils/uiCopy'

type Draft = {
  name: string
  auth_url: string
  username: string
  password: string
  project_name: string
  project_id: string
  user_domain_name: string
  project_domain_name: string
  region_name: string
  interface: string
  identity_interface: string
  endpoint_override_json: string
}

const INITIAL_DRAFT: Draft = {
  name: 'new-cloud',
  auth_url: '',
  username: '',
  password: '',
  project_name: '',
  project_id: '',
  user_domain_name: 'Default',
  project_domain_name: 'Default',
  region_name: 'RegionOne',
  interface: 'internal',
  identity_interface: 'internal',
  endpoint_override_json: '{}',
}

const OPENSTACK_INTERFACES = ['internal', 'public', 'admin']

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function parseEndpointOverride(raw: string): Record<string, string> | null {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    const cleanKey = key.trim()
    if (!cleanKey || typeof value !== 'string' || !isHttpUrl(value.trim())) return null
    out[cleanKey] = value.trim()
  }
  return out
}

function buildCloudsSnippet(draft: Draft): string {
  const userDomainName = draft.user_domain_name.trim() || 'Default'
  const projectDomainName = draft.project_domain_name.trim() || 'Default'
  const regionName = draft.region_name.trim() || 'RegionOne'
  const interfaceName = draft.interface.trim() || 'internal'
  const identityInterface = draft.identity_interface.trim() || 'internal'
  const lines = [
    'clouds:',
    `  ${draft.name.trim()}:`,
    '    auth:',
    `      auth_url: ${draft.auth_url.trim() || '<keystone-url>/v3'}`,
    `      username: ${draft.username.trim() || '<username>'}`,
    `      password: ${draft.password || '<password>'}`,
    draft.project_id.trim() ? `      project_id: ${draft.project_id.trim()}` : `      project_name: ${draft.project_name.trim() || '<project>'}`,
    `      user_domain_name: ${userDomainName}`,
    `      project_domain_name: ${projectDomainName}`,
    `    region_name: ${regionName}`,
    `    interface: ${interfaceName}`,
    `    identity_interface: ${identityInterface}`,
  ]
  return lines.join('\n')
}

export default function ProvidersPage() {
  const nav = useNavigate()
  const { locale } = useI18n()
  const ko = locale === 'ko'
  const [items, setItems] = useState<ProviderConnection[]>([])
  const [defaultCloud, setDefaultCloud] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT)
  const [copied, setCopied] = useState(false)
  const [preflight, setPreflight] = useState<ProviderPreflight | null>(null)
  const [preflightBusy, setPreflightBusy] = useState<string | null>(null)
  const [preflightError, setPreflightError] = useState<string | null>(null)

  async function load() {
    setError(null)
    setNotice(null)
    try {
      await auth.me()
    } catch {
      nav('/login')
      return
    }
    try {
      const res: ProviderListResponse = await providers.list()
      setItems(res.items)
      setDefaultCloud(res.default_cloud || '')
      if (!draft.name || draft.name === INITIAL_DRAFT.name) {
        const nextName = res.items.length === 0 ? 'openstack-main' : `openstack-${res.items.length + 1}`
        setDraft((prev) => ({ ...prev, name: nextName }))
      }
    } catch (err: any) {
      setError(err?.message || 'failed to load providers')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const snippet = useMemo(() => buildCloudsSnippet(draft), [draft])
  const trimmedProviderName = draft.name.trim()
  const providerNameValid = !trimmedProviderName || isSafeProviderName(trimmedProviderName)
  const command = useMemo(
    () =>
      [
        'kubectl -n infra create secret generic openstack-clouds \\',
        '  --from-file=clouds.yaml=/path/to/clouds.yaml \\',
        '  --dry-run=client -o yaml | kubectl apply -f -',
        'kubectl -n infra rollout restart deploy/infra-orch-api deploy/infra-orch-runner',
      ].join('\n'),
    [],
  )

  async function copySnippet(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  async function saveProvider() {
    setError(null)
    setNotice(null)
    if (!isSafeProviderName(draft.name.trim())) {
      setError(ko ? '공급자 이름은 영문, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.' : 'Provider name can contain only letters, numbers, dots, underscores, or dashes.')
      return
    }
    if (!OPENSTACK_INTERFACES.includes(draft.interface.trim()) || !OPENSTACK_INTERFACES.includes(draft.identity_interface.trim())) {
      setError(ko ? '인터페이스는 internal, public, admin 중 하나여야 합니다.' : 'Interface values must be one of internal, public, or admin.')
      return
    }
    if (!isHttpUrl(draft.auth_url.trim())) {
      setError(ko ? 'Keystone Auth URL은 http 또는 https URL이어야 합니다.' : 'Keystone Auth URL must be an http or https URL.')
      return
    }
    const endpointOverride = parseEndpointOverride(draft.endpoint_override_json)
    if (endpointOverride === null) {
      setError(ko ? 'Endpoint override는 값이 http(s) URL인 JSON 객체여야 합니다.' : 'Endpoint override must be a JSON object whose values are http(s) URLs.')
      return
    }
    setSaving(true)
    try {
      await providers.upsert({
        name: draft.name.trim(),
        auth_url: draft.auth_url.trim(),
        region_name: draft.region_name.trim(),
        interface: draft.interface.trim(),
        identity_interface: draft.identity_interface.trim(),
        username: draft.username.trim(),
        password: draft.password,
        project_name: draft.project_name.trim(),
        project_id: draft.project_id.trim(),
        user_domain_name: draft.user_domain_name.trim() || 'Default',
        project_domain_name: draft.project_domain_name.trim() || 'Default',
        endpoint_override: endpointOverride,
      })
      setNotice(ko ? `공급자 ${draft.name} 저장 완료` : `Saved provider ${draft.name}`)
      await load()
    } catch (err: any) {
      setError(err?.message || 'failed to save provider')
    } finally {
      setSaving(false)
    }
  }

  async function runPreflight(name: string) {
    setPreflightBusy(name)
    setPreflightError(null)
    setPreflight(null)
    try {
      const result = await providers.preflight(name)
      setPreflight(result)
    } catch (err: any) {
      setPreflightError(err?.message || 'provider preflight failed')
    } finally {
      setPreflightBusy(null)
    }
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{ko ? '공급자 연결 / OpenStack' : 'Provider connections / OpenStack'}</div>
          <h1 className="page-title">{ko ? '공급자 연결 관리' : 'Provider connection management'}</h1>
          <p className="page-copy">
            {ko
              ? '연결된 공급자를 확인하고, 새 공급자 clouds.yaml 초안을 생성해 즉시 배포 시크릿에 반영할 수 있습니다.'
              : 'Inspect connected providers and generate a new clouds.yaml draft that can be applied to the deployment secret.'}
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={load}>
            {ko ? '새로고침' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}
      {notice ? <section className="success-box">{notice}</section> : null}

      <section className="stats-grid template-stats-grid">
        <article className="metric-card metric-card-primary">
          <span>{ko ? '연결된 공급자' : 'Connected providers'}</span>
          <strong>{items.length}</strong>
          <p>{ko ? '현재 API가 읽고 있는 OpenStack cloud 엔트리 수입니다.' : 'Number of OpenStack cloud entries currently visible to the API.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '기본 공급자' : 'Default provider'}</span>
          <strong>{defaultCloud || '-'}</strong>
          <p>{ko ? '생성 흐름에서 기본 선택으로 제시되는 cloud 이름입니다.' : 'Cloud name pre-selected by default in the create flow.'}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '목록' : 'List'}</div>
              <h2>{ko ? '공급자 연결' : 'Provider connections'}</h2>
            </div>
          </div>
          <div className="stack-list">
            {items.length === 0 ? (
              <div className="empty-state">{ko ? '공급자 엔트리가 없습니다. 우측의 추가 화면에서 clouds.yaml 초안을 만든 뒤 적용하세요.' : 'No provider entries found. Build a clouds.yaml draft from the add panel and apply it.'}</div>
            ) : (
              items.map((item) => (
                <div className="stack-row" key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <div className="row-meta">{item.auth_url}</div>
                    <div className="chip-row" style={{ marginTop: 10 }}>
                      <span className="badge badge-muted">{ko ? `리전 ${item.region || '-'}` : `region ${item.region || '-'}`}</span>
                      <span className="badge badge-muted">{ko ? `인터페이스 ${item.interface || '-'}` : `interface ${item.interface || '-'}`}</span>
                      <span className="badge badge-muted">{ko ? `ID 인터페이스 ${item.identity_interface || '-'}` : `identity ${item.identity_interface || '-'}`}</span>
                    </div>
                  </div>
                  <div className="detail-actions">
                    <button className="ghost" onClick={() => void runPreflight(item.name)} disabled={preflightBusy !== null}>
                      {preflightBusy === item.name ? (ko ? '점검 중...' : 'Checking...') : ko ? '적용 전 점검' : 'Preflight'}
                    </button>
                    <Link className="ghost action-link action-link-button" to={`/providers/${encodeURIComponent(item.name)}`}>
                      {ko ? '상세 보기' : 'View details'}
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
          {preflight ? (
            <div className={`callout ${preflight.ready_for_plan_apply ? 'callout-success' : 'callout-warning'}`} style={{ marginTop: 14 }}>
              <strong>
                {preflight.provider}: {preflight.ready_for_plan_apply ? (ko ? 'Plan/Apply 준비됨' : 'Ready for plan/apply') : ko ? 'Endpoint 확인 필요' : 'Endpoint check needed'}
              </strong>
              <p style={{ margin: '6px 0 0' }}>
                {Object.keys(preflight.endpoints || {}).sort().join(', ') || '-'}
                {preflight.missing_endpoints?.length ? ` / missing: ${preflight.missing_endpoints.join(', ')}` : ''}
              </p>
            </div>
          ) : null}
          {preflightError ? <div className="error-box" style={{ marginTop: 14 }}>{summarizeOperatorError(preflightError)}</div> : null}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '추가' : 'Add'}</div>
              <h2>{ko ? '공급자 추가 초안' : 'Add provider draft'}</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
            <label className="field">
              <span>{ko ? '공급자 이름' : 'Provider name'}</span>
              <input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value.trim() }))} placeholder="exporter-internal" />
              {!providerNameValid ? <small>{ko ? '영문, 숫자, 점, 밑줄, 하이픈만 허용됩니다.' : 'Use only letters, numbers, dots, underscores, or dashes.'}</small> : null}
            </label>
            <label className="field">
              <span>Keystone Auth URL</span>
              <input value={draft.auth_url} onChange={(e) => setDraft((prev) => ({ ...prev, auth_url: e.target.value.trim() }))} placeholder="http://192.168.219.121:5000/v3" />
            </label>
            <div className="grid-two">
              <label className="field">
                <span>{ko ? '사용자명' : 'Username'}</span>
                <input value={draft.username} onChange={(e) => setDraft((prev) => ({ ...prev, username: e.target.value }))} placeholder="admin" />
              </label>
              <label className="field">
                <span>{ko ? '프로젝트명' : 'Project name'}</span>
                <input value={draft.project_name} onChange={(e) => setDraft((prev) => ({ ...prev, project_name: e.target.value }))} placeholder="admin" />
              </label>
            </div>
            <label className="field">
              <span>{ko ? '프로젝트 ID' : 'Project ID'}</span>
              <input value={draft.project_id} onChange={(e) => setDraft((prev) => ({ ...prev, project_id: e.target.value }))} placeholder={ko ? '프로젝트명을 사용할 수 없을 때 입력' : 'Use when project name is unavailable'} />
            </label>
            <label className="field">
              <span>{ko ? '비밀번호' : 'Password'}</span>
              <input type="password" value={draft.password} onChange={(e) => setDraft((prev) => ({ ...prev, password: e.target.value }))} placeholder="********" />
            </label>
            <div className="grid-three">
              <label className="field">
                <span>{ko ? '리전' : 'Region'}</span>
                <input value={draft.region_name} onChange={(e) => setDraft((prev) => ({ ...prev, region_name: e.target.value }))} placeholder="RegionOne" />
              </label>
              <label className="field">
                <span>{ko ? '인터페이스' : 'Interface'}</span>
                <select value={draft.interface} onChange={(e) => setDraft((prev) => ({ ...prev, interface: e.target.value }))}>
                  {OPENSTACK_INTERFACES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{ko ? 'ID 인터페이스' : 'Identity interface'}</span>
                <select value={draft.identity_interface} onChange={(e) => setDraft((prev) => ({ ...prev, identity_interface: e.target.value }))}>
                  {OPENSTACK_INTERFACES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Endpoint override JSON</span>
              <textarea
                rows={4}
                value={draft.endpoint_override_json}
                onChange={(e) => setDraft((prev) => ({ ...prev, endpoint_override_json: e.target.value }))}
                placeholder='{"compute":"https://compute.example/v2.1"}'
              />
            </label>
            <div className="detail-actions">
              <button type="button" onClick={saveProvider} disabled={saving || !draft.name || !providerNameValid || !draft.auth_url || !draft.username || !draft.password || (!draft.project_name && !draft.project_id)}>
                {saving ? (ko ? '저장 중...' : 'Saving...') : ko ? '공급자 저장' : 'Save provider'}
              </button>
              <button type="button" className="ghost" onClick={() => copySnippet(snippet)}>
                {copied ? (ko ? 'clouds.yaml 복사됨' : 'clouds.yaml copied') : ko ? 'clouds.yaml 복사' : 'Copy clouds.yaml'}
              </button>
              <button type="button" className="ghost" onClick={() => copySnippet(command)}>
                {ko ? '적용 명령 복사' : 'Copy apply command'}
              </button>
            </div>
          </form>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">clouds.yaml</div>
              <h2>{ko ? '생성된 초안' : 'Generated draft'}</h2>
            </div>
          </div>
          <pre className="json-block">{snippet}</pre>
        </article>
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '적용 절차' : 'Apply procedure'}</div>
              <h2>{ko ? '클러스터 반영' : 'Cluster update'}</h2>
            </div>
          </div>
          <pre className="json-block">{command}</pre>
        </article>
      </section>
    </div>
  )
}
