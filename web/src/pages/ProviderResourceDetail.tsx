import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { auth, ProviderCatalog, ProviderResourceDetail, providers } from '../api'
import { useI18n } from '../i18n'
import { summarizeOperatorError } from '../utils/uiCopy'

type ResourceType = 'images' | 'flavors' | 'networks' | 'instances'

function resourceLabel(kind: ResourceType, ko: boolean): string {
  if (kind === 'images') return ko ? '이미지' : 'Images'
  if (kind === 'flavors') return ko ? '플레이버' : 'Flavors'
  if (kind === 'networks') return ko ? '네트워크' : 'Networks'
  return ko ? '인스턴스' : 'Instances'
}

function rowsForType(catalog: ProviderCatalog | null, kind: ResourceType): ProviderResourceDetail[] {
  if (!catalog) return []
  if (kind === 'images') return catalog.image_details || []
  if (kind === 'flavors') return catalog.flavor_details || []
  if (kind === 'networks') return catalog.network_details || []
  return catalog.instance_details || []
}

export default function ProviderResourceDetailPage() {
  const nav = useNavigate()
  const { locale } = useI18n()
  const ko = locale === 'ko'
  const { name, resourceType, resourceId } = useParams<{
    name: string
    resourceType: ResourceType
    resourceId: string
  }>()
  const providerName = decodeURIComponent(name || '')
  const kind = (resourceType || 'images') as ResourceType
  const decodedResourceId = decodeURIComponent(resourceId || '')
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!providerName) {
      nav('/providers')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await auth.me()
    } catch {
      nav('/login')
      return
    }
    try {
      const res = await providers.resources(providerName)
      setCatalog(res)
    } catch (err: any) {
      setError(err?.message || 'failed to load resource detail')
      setCatalog(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [providerName, kind, decodedResourceId])

  const item = useMemo(() => {
    const rows = rowsForType(catalog, kind)
    return rows.find((row) => row.id === decodedResourceId || row.name === decodedResourceId) || null
  }, [catalog, kind, decodedResourceId])

  const attrs = useMemo(() => {
    if (!item?.attributes) return []
    return Object.entries(item.attributes).sort((a, b) => a[0].localeCompare(b[0]))
  }, [item])

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{ko ? '가용 자원 상세' : 'Resource detail'}</div>
          <h1 className="page-title">{item?.name || decodedResourceId || '-'}</h1>
          <p className="page-copy">
            {ko
              ? '공급자 하위 자원의 상세 속성을 확인합니다.'
              : 'Inspect detailed attributes for a provider resource.'}
          </p>
        </div>
        <div className="hero-actions">
          <Link to={`/providers/${encodeURIComponent(providerName)}`} className="ghost action-link action-link-button">
            {ko ? '공급자 상세로' : 'Back to provider'}
          </Link>
          <button className="ghost" onClick={load} disabled={busy}>
            {busy ? (ko ? '새로고침 중...' : 'Refreshing...') : ko ? '새로고침' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '식별' : 'Identity'}</div>
              <h2>{ko ? '리소스 기본 정보' : 'Resource identity'}</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>{ko ? '공급자' : 'Provider'}</span>
              <strong>{providerName}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '자원 종류' : 'Resource type'}</span>
              <strong>{resourceLabel(kind, ko)}</strong>
            </div>
            <div className="meta-item">
              <span>ID</span>
              <strong>{item?.id || decodedResourceId || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '이름' : 'Name'}</span>
              <strong>{item?.name || '-'}</strong>
            </div>
          </div>
        </article>

        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '속성' : 'Attributes'}</div>
              <h2>{ko ? '상세 속성' : 'Detailed attributes'}</h2>
            </div>
          </div>
          {item ? (
            attrs.length > 0 ? (
              <div className="info-grid">
                {attrs.map(([key, value]) => (
                  <div className="meta-item" key={key}>
                    <span>{key}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">{ko ? '표시할 상세 속성이 없습니다.' : 'No detailed attributes available.'}</div>
            )
          ) : (
            <div className="empty-state">
              {ko ? '해당 리소스를 찾지 못했습니다. 목록에서 다시 선택하세요.' : 'Resource not found. Select it again from the list.'}
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
