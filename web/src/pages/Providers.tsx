import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, ProviderConnection, ProviderListResponse, providers } from '../api'
import { useI18n } from '../i18n'
import { summarizeOperatorError } from '../utils/uiCopy'

type Draft = {
  name: string
  auth_url: string
  username: string
  password: string
  project_name: string
  user_domain_name: string
  project_domain_name: string
  region_name: string
  interface: string
  identity_interface: string
}

const INITIAL_DRAFT: Draft = {
  name: 'new-cloud',
  auth_url: '',
  username: '',
  password: '',
  project_name: '',
  user_domain_name: 'Default',
  project_domain_name: 'Default',
  region_name: 'RegionOne',
  interface: 'internal',
  identity_interface: 'internal',
}

function buildCloudsSnippet(draft: Draft): string {
  const lines = [
    'clouds:',
    `  ${draft.name}:`,
    '    auth:',
    `      auth_url: ${draft.auth_url || '<keystone-url>/v3'}`,
    `      username: ${draft.username || '<username>'}`,
    `      password: ${draft.password || '<password>'}`,
    `      project_name: ${draft.project_name || '<project>'}`,
    `      user_domain_name: ${draft.user_domain_name || 'Default'}`,
    `      project_domain_name: ${draft.project_domain_name || 'Default'}`,
    `    region_name: ${draft.region_name || 'RegionOne'}`,
    `    interface: ${draft.interface || 'internal'}`,
    `    identity_interface: ${draft.identity_interface || 'internal'}`,
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
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT)
  const [copied, setCopied] = useState(false)

  async function load() {
    setError(null)
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
                    <Link className="ghost action-link action-link-button" to={`/providers/${encodeURIComponent(item.name)}`}>
                      {ko ? '상세 보기' : 'View details'}
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
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
                <input value={draft.interface} onChange={(e) => setDraft((prev) => ({ ...prev, interface: e.target.value }))} placeholder="internal" />
              </label>
              <label className="field">
                <span>{ko ? 'ID 인터페이스' : 'Identity interface'}</span>
                <input value={draft.identity_interface} onChange={(e) => setDraft((prev) => ({ ...prev, identity_interface: e.target.value }))} placeholder="internal" />
              </label>
            </div>
            <div className="detail-actions">
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
