import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { auth, ProviderCatalog, ProviderConnection, providers } from '../api'
import { useI18n } from '../i18n'
import { summarizeOperatorError } from '../utils/uiCopy'

type TabKey = 'images' | 'flavors' | 'networks' | 'instances'

export default function ProviderDetailPage() {
  const nav = useNavigate()
  const { name } = useParams<{ name: string }>()
  const providerName = decodeURIComponent(name || '')
  const { locale } = useI18n()
  const ko = locale === 'ko'
  const [providerInfo, setProviderInfo] = useState<ProviderConnection | null>(null)
  const [catalog, setCatalog] = useState<ProviderCatalog | null>(null)
  const [tab, setTab] = useState<TabKey>('images')
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
      const [list, resources] = await Promise.all([providers.list(), providers.resources(providerName)])
      setProviderInfo(list.items.find((item) => item.name === providerName) || null)
      setCatalog(resources)
    } catch (err: any) {
      setError(err?.message || 'failed to load provider detail')
      setCatalog(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [providerName])

  const rows = useMemo(() => {
    if (!catalog) return []
    if (tab === 'images') return catalog.images
    if (tab === 'flavors') return catalog.flavors
    if (tab === 'networks') return catalog.networks
    return catalog.instances
  }, [catalog, tab])

  const tabItems: Array<{ key: TabKey; labelEn: string; labelKo: string; count: number }> = [
    { key: 'images', labelEn: 'Images', labelKo: '이미지', count: catalog?.images.length || 0 },
    { key: 'flavors', labelEn: 'Flavors', labelKo: '플레이버', count: catalog?.flavors.length || 0 },
    { key: 'networks', labelEn: 'Networks', labelKo: '네트워크', count: catalog?.networks.length || 0 },
    { key: 'instances', labelEn: 'Instances', labelKo: '인스턴스', count: catalog?.instances.length || 0 },
  ]

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">{ko ? '공급자 상세 / 카탈로그' : 'Provider detail / catalog'}</div>
          <h1 className="page-title">{providerName || '-'}</h1>
          <p className="page-copy">
            {ko
              ? '연결된 공급자의 가용 자원을 상세 목록으로 확인합니다.'
              : 'Inspect available resources for the selected provider in detail.'}
          </p>
        </div>
        <div className="hero-actions">
          <Link to="/providers" className="ghost action-link action-link-button">
            {ko ? '공급자 목록' : 'Provider list'}
          </Link>
          <button className="ghost" onClick={load} disabled={busy}>
            {busy ? (ko ? '새로고침 중...' : 'Refreshing...') : ko ? '새로고침' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? <section className="error-box">{summarizeOperatorError(error)}</section> : null}

      <section className="stats-grid template-stats-grid">
        <article className="metric-card metric-card-primary">
          <span>{ko ? '이미지' : 'Images'}</span>
          <strong>{catalog?.images.length || 0}</strong>
          <p>{ko ? '부팅 가능한 이미지 목록' : 'Bootable image catalog.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '플레이버' : 'Flavors'}</span>
          <strong>{catalog?.flavors.length || 0}</strong>
          <p>{ko ? '인스턴스 크기/리소스 프로파일' : 'Instance size and resource profiles.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '네트워크' : 'Networks'}</span>
          <strong>{catalog?.networks.length || 0}</strong>
          <p>{ko ? '선택 가능한 네트워크 자원' : 'Available network resources.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '인스턴스' : 'Instances'}</span>
          <strong>{catalog?.instances.length || 0}</strong>
          <p>{ko ? '현재 연결된 프로젝트 인스턴스' : 'Current instances in the project.'}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '연결 정보' : 'Connection info'}</div>
              <h2>{ko ? '공급자 연결' : 'Provider connection'}</h2>
            </div>
          </div>
          <div className="info-grid">
            <div className="meta-item">
              <span>{ko ? '이름' : 'Name'}</span>
              <strong>{providerInfo?.name || providerName}</strong>
            </div>
            <div className="meta-item">
              <span>Auth URL</span>
              <strong>{providerInfo?.auth_url || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '리전' : 'Region'}</span>
              <strong>{providerInfo?.region || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '인터페이스' : 'Interface'}</span>
              <strong>{providerInfo?.interface || '-'}</strong>
            </div>
          </div>
          {catalog?.fetched_at ? (
            <div className="note-card">
              <strong>{ko ? '마지막 조회 시각' : 'Last fetched at'}</strong>
              <p>{new Date(catalog.fetched_at).toLocaleString()}</p>
            </div>
          ) : null}
        </article>

        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '하위 메뉴' : 'Sub menu'}</div>
              <h2>{ko ? '가용 자원 상세' : 'Available resource detail'}</h2>
            </div>
          </div>

          <div className="chip-row" style={{ marginBottom: 14 }}>
            {tabItems.map((item) => (
              <button
                type="button"
                key={item.key}
                className={`filter-chip ${tab === item.key ? 'filter-chip-active' : ''}`}
                onClick={() => setTab(item.key)}
              >
                {ko ? item.labelKo : item.labelEn} ({item.count})
              </button>
            ))}
          </div>

          <div className="stack-list">
            {rows.length === 0 ? (
              <div className="empty-state">
                {ko ? '이 메뉴에서 표시할 자원이 없습니다.' : 'No resources were returned for this menu.'}
              </div>
            ) : (
              rows.map((item) => (
                <div className="stack-row" key={item}>
                  <div>
                    <strong>{item}</strong>
                  </div>
                </div>
              ))
            )}
          </div>

          {catalog?.errors && catalog.errors.length > 0 ? (
            <div className="note-card" style={{ marginTop: 14 }}>
              <strong>{ko ? '부분 조회 실패' : 'Partial fetch errors'}</strong>
              <div className="stack-list" style={{ marginTop: 10 }}>
                {catalog.errors.map((item) => (
                  <div className="row-meta" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </div>
  )
}
