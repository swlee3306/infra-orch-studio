import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { auth, overview, OverviewResponse } from '../api'
import { useI18n } from '../i18n'
import { formatDateTime } from '../utils/format'

type StageKey = 'create' | 'review' | 'approval' | 'result'

type StageCard = {
  key: StageKey
  title: string
  summary: string
  detail: string
  link: string
  action: string
  tone: 'primary' | 'info' | 'warning' | 'success'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function formatValue(value: unknown, locale = 'en'): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (isRecord(value)) {
    const parts: string[] = []
    const status = value.status || value.state || value.phase
    if (typeof status === 'string' && status.trim()) parts.push(status.trim())
    const summary = value.summary || value.detail || value.message || value.title || value.label
    if (typeof summary === 'string' && summary.trim()) parts.push(summary.trim())
    const count = value.count ?? value.total ?? value.size
    if (typeof count === 'number') parts.push(`${count} item${count === 1 ? '' : 's'}`)
    if (Array.isArray(value.items)) parts.push(`${value.items.length} item${value.items.length === 1 ? '' : 's'}`)
    const timestamp = value.updated_at || value.updatedAt || value.created_at || value.createdAt
    if (typeof timestamp === 'string' && timestamp.trim()) {
      parts.push(formatDateTime(timestamp, locale))
    }
    if (parts.length > 0) return parts.join(' · ')
    const keys = Object.keys(value).filter((key) => !['id', 'name', 'key', 'slug'].includes(key)).slice(0, 3)
    if (keys.length > 0) return keys.join(', ')
  }
  return null
}

function matchStageValue(source: unknown, key: StageKey): unknown {
  if (!isRecord(source)) return null
  const aliases: Record<StageKey, string[]> = {
    create: ['draft', 'request', 'queue', 'queued', 'requests'],
    review: ['plan', 'planReview', 'preview', 'pending_approval'],
    approval: ['approved', 'gate', 'checkpoint', 'policy'],
    result: ['done', 'success', 'completed', 'jobs', 'history', 'outcome'],
  }
  const candidates = [key, ...aliases[key]].map(normalizeKey)
  const qualifiers = ['summary', 'status', 'state', 'count', 'total', 'items', 'list', 'queue', 'ready', 'failed', 'done', 'result', 'progress', 'latest']

  for (const [entryKey, entryValue] of Object.entries(source)) {
    const normalized = normalizeKey(entryKey)
    if (candidates.some((candidate) => normalized === candidate)) {
      return entryValue
    }
    if (candidates.some((candidate) => normalized.includes(candidate)) && qualifiers.some((qualifier) => normalized.includes(qualifier))) {
      return entryValue
    }
  }

  for (const nestedKey of ['overview', 'summary', 'metrics', 'cards', 'stages', 'items', 'steps', 'data', 'payload']) {
    const nested = source[nestedKey]
    if (Array.isArray(nested)) {
      const item = nested.find((entry) => {
        if (!isRecord(entry)) return false
        const label = String(entry.key || entry.stage || entry.slug || entry.name || entry.title || '')
        const normalized = normalizeKey(label)
        return candidates.some((candidate) => normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized))
      })
      if (item) return item
    }
    if (isRecord(nested)) {
      const direct = matchStageValue(nested, key)
      if (direct !== null) return direct
    }
  }

  return null
}

function stageDetail(source: unknown, key: StageKey, fallback: string, locale = 'en'): string {
  return formatValue(matchStageValue(source, key), locale) || fallback
}

export default function GuidedStartPage() {
  const nav = useNavigate()
  const { locale } = useI18n()
  const ko = locale === 'ko'
  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await auth.me()
      } catch {
        nav('/login')
        return
      }

      try {
        const res = await overview.get()
        if (!cancelled) {
          setOverviewData(res)
          setStatusNote(null)
        }
      } catch {
        if (!cancelled) {
          setOverviewData(null)
          setStatusNote(ko ? '라이브 개요를 불러오지 못해 로컬 안내로 표시합니다.' : 'Live overview could not load, so local guidance is shown.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [ko, nav])

  const cards = useMemo<StageCard[]>(() => {
    const fallback = {
      create: ko ? '요청 초안과 원하는 상태를 정리합니다.' : 'Shape the desired state and draft the request.',
      review: ko ? '플랜과 영향도를 확인합니다.' : 'Inspect the plan and its impact.',
      approval: ko ? '승인 기준을 확인한 뒤 게이트를 엽니다.' : 'Confirm the gate before approval.',
      result: ko ? '실행 결과와 감사 흔적을 검토합니다.' : 'Review the execution result and audit trail.',
    }

    return [
      {
        key: 'create',
        title: ko ? 'Create' : 'Create',
        summary: stageDetail(overviewData, 'create', fallback.create, locale),
        detail: ko ? '새 환경 요청을 시작하는 입력 단계입니다.' : 'Start the environment request from here.',
        link: '/create-environment',
        action: ko ? '생성 흐름 열기' : 'Open create flow',
        tone: 'primary',
      },
      {
        key: 'review',
        title: ko ? 'Review' : 'Review',
        summary: stageDetail(overviewData, 'review', fallback.review, locale),
        detail: ko ? '현재 플랜과 변경 영향을 비교합니다.' : 'Compare the current plan with its impact.',
        link: '/dashboard',
        action: ko ? '검토 대시보드 열기' : 'Open review dashboard',
        tone: 'info',
      },
      {
        key: 'approval',
        title: ko ? 'Approval' : 'Approval',
        summary: stageDetail(overviewData, 'approval', fallback.approval, locale),
        detail: ko ? '승인 가능한 변경만 다음 단계로 넘깁니다.' : 'Move only approved changes forward.',
        link: '/environments',
        action: ko ? '승인 대상 보기' : 'See approval targets',
        tone: 'warning',
      },
      {
        key: 'result',
        title: ko ? 'Result' : 'Result',
        summary: stageDetail(overviewData, 'result', fallback.result, locale),
        detail: ko ? '실행 완료 후 결과와 이력을 확인합니다.' : 'Inspect outcomes after execution completes.',
        link: '/jobs',
        action: ko ? '결과 열기' : 'Open results',
        tone: 'success',
      },
    ]
  }, [ko, overviewData])

  return (
    <div className="page-stack guided-start-page">
      <section className="hero-panel guided-start-hero">
        <div>
          <div className="page-kicker">{ko ? '가이드드 스타트' : 'Guided Start'}</div>
          <h1 className="page-title">{ko ? '복잡도를 낮춘 한 사이클 시작 화면' : 'A lower-friction start screen for one full cycle'}</h1>
          <p className="page-copy">
            {ko
              ? 'Create, Review, Approval, Result 순서로 한 번에 흐름을 잡고, 현재 상태는 가능한 경우 /api/overview 에서 가져옵니다.'
              : 'Follow Create, Review, Approval, and Result in one pass, with live status pulled from /api/overview when available.'}
          </p>
          <div className="hero-actions" style={{ marginTop: 16 }}>
            <Link to="/create-environment" className="action-link-button">
              {ko ? '바로 생성 시작' : 'Start creating'}
            </Link>
            <button type="button" className="ghost" onClick={() => window.location.reload()}>
              {ko ? '현재 상태 새로고침' : 'Refresh status'}
            </button>
          </div>
          {statusNote ? <div className="error-box" style={{ marginTop: 16 }}>{statusNote}</div> : null}
          <div className="row-meta" style={{ marginTop: 14 }}>
            {loading ? (ko ? '상태를 불러오는 중...' : 'Loading status...') : ko ? '라이브 상태 준비 완료' : 'Live status ready'}
          </div>
        </div>

        <article className="console-card guided-start-note">
          <div className="section-kicker">{ko ? '한 사이클' : 'One cycle'}</div>
          <h2>{ko ? '복잡한 운영을 4단계로 압축' : 'Compress the workflow into four clear steps'}</h2>
          <ol className="guide-list">
            <li>{ko ? 'Create에서 원하는 상태를 만든다.' : 'Create the desired state.'}</li>
            <li>{ko ? 'Review에서 플랜과 영향도를 확인한다.' : 'Review the plan and impact.'}</li>
            <li>{ko ? 'Approval에서 승인 기준을 적용한다.' : 'Apply the approval gate.'}</li>
            <li>{ko ? 'Result에서 실행 결과와 이력을 확인한다.' : 'Inspect the resulting execution and history.'}</li>
          </ol>
        </article>
      </section>

      <section className="guided-stage-grid">
        {cards.map((card) => (
          <article key={card.key} className={`metric-card guided-stage-card guided-stage-card-${card.tone}`}>
            <div className="section-kicker">{card.title}</div>
            <strong className="guided-stage-summary">{card.summary}</strong>
            <p>{card.detail}</p>
            <div className="guided-stage-actions">
              <Link to={card.link} className="action-link-button ghost">
                {card.action}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">{ko ? '빠른 안내' : 'Quick guide'}</div>
            <h2>{ko ? '이 화면을 시작점으로 쓰는 방법' : 'How to use this screen as the starting point'}</h2>
          </div>
        </div>
        <div className="info-grid grid-two">
          <div className="meta-item">
            <span>{ko ? '1. Create' : '1. Create'}</span>
            <strong>{ko ? '생성 흐름으로 들어가 원하는 상태를 먼저 만드세요.' : 'Enter the create flow and shape the desired state first.'}</strong>
          </div>
          <div className="meta-item">
            <span>{ko ? '2. Review' : '2. Review'}</span>
            <strong>{ko ? '리뷰 대시보드에서 검토가 필요한 변화를 확인하세요.' : 'Use the review dashboard to inspect changes that need attention.'}</strong>
          </div>
          <div className="meta-item">
            <span>{ko ? '3. Approval' : '3. Approval'}</span>
            <strong>{ko ? '승인 대상만 환경 목록에서 골라 다음 단계로 넘기세요.' : 'Pick only approval targets from the environment list.'}</strong>
          </div>
          <div className="meta-item">
            <span>{ko ? '4. Result' : '4. Result'}</span>
            <strong>{ko ? '실행 결과는 작업 목록과 감사 로그로 마무리하세요.' : 'Close the loop with jobs and audit logs.'}</strong>
          </div>
        </div>
      </section>
    </div>
  )
}
