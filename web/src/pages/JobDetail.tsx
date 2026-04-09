import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { auth, jobs, Job, wsUrl } from '../api'
import StatusBadge from '../components/StatusBadge'
import { useI18n } from '../i18n'

type WsEvent =
  | { type: 'log'; jobId: string; file?: string; message: string }
  | { type: 'status'; jobId: string; status: string; error?: string }
  | { type: 'error'; message: string }

type LogEntry = {
  id: string
  file?: string
  message: string
}

function parseJson(value?: string): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function environmentRoute(job: Job | null): string | null {
  if (!job?.environment_id) return null
  if (job.status === 'done' && job.type === 'tofu.plan') return `/environments/${job.environment_id}/review`
  return `/environments/${job.environment_id}`
}

function approvalRoute(job: Job | null): string | null {
  if (!job?.environment_id) return null
  return `/environments/${job.environment_id}/approval`
}

export default function JobDetailPage() {
  const nav = useNavigate()
  const { locale, copy } = useI18n()
  const ko = locale === 'ko'
  const { id } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState<string>('')
  const [viewer, setViewer] = useState<{ email: string; is_admin?: boolean } | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [applying, setApplying] = useState(false)

  const jobId = useMemo(() => id || '', [id])
  const outputs = useMemo(() => parseJson(job?.outputs_json), [job?.outputs_json])
  const env = job?.environment as
    | {
        environment_name?: string
        tenant_name?: string
        network?: { name?: string; cidr?: string }
        subnet?: { name?: string; cidr?: string; gateway_ip?: string; enable_dhcp?: boolean }
        instances?: Array<{ name?: string; image?: string; flavor?: string; count?: number }>
        security_groups?: string[]
      }
    | undefined
  const envLink = environmentRoute(job)
  const controlLink = approvalRoute(job)

  async function loadJob() {
    setError(null)
    try {
      const me = await auth.me()
      setViewer(me)
    } catch {
      nav('/login')
      return
    }

    if (!jobId) return
    try {
      const nextJob = await jobs.get(jobId)
      setJob(nextJob)
      setStatus(nextJob.status)
    } catch (err: any) {
      setError(err?.message || 'failed')
    }
  }

  useEffect(() => {
    loadJob()
  }, [jobId])

  useEffect(() => {
    if (!jobId) return

    const ws = new WebSocket(wsUrl())

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'subscribe', jobId }))
    }
    ws.onclose = () => {
      setConnected(false)
    }
    ws.onerror = () => {
      setConnected(false)
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsEvent
        if (msg.type === 'log' && msg.jobId === jobId) {
          setLogs((prev) =>
            prev.concat({
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              file: msg.file,
              message: msg.message,
            }),
          )
        }
        if (msg.type === 'status' && msg.jobId === jobId) {
          setStatus(msg.status)
          setJob((prev) => (prev ? { ...prev, status: msg.status, error: msg.error ?? prev.error } : prev))
        }
        if (msg.type === 'error') {
          setError(msg.message)
        }
      } catch {
        // ignore malformed frames
      }
    }

    return () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }, [jobId])

  const canApply = Boolean(
    viewer?.is_admin &&
      job?.type === 'tofu.plan' &&
      job.status === 'done' &&
      job.plan_path &&
      job.workdir &&
      !job.environment_id,
  )
  const canOpenControl = Boolean(job?.environment_id && (job.status === 'done' || job.status === 'failed'))

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="page-kicker">
            <Link to="/jobs" className="text-link">
              Executions
            </Link>{' '}
            / {copy.jobDetail.kicker}
          </div>
          <h1 className="page-title">{copy.jobDetail.title} / {jobId.slice(0, 8) || 'job'}</h1>
          <p className="page-copy">{copy.jobDetail.copy}</p>
        </div>
        <div className="hero-actions">
          <span className="badge badge-muted">{copy.jobDetail.viewer}: {viewer?.email || (ko ? '불러오는 중...' : 'loading...')}</span>
          <span className={`badge ${connected ? 'badge-running' : 'badge-muted'}`}>WS: {connected ? copy.jobDetail.wsConnected : copy.jobDetail.wsOffline}</span>
          <button className="ghost" onClick={loadJob}>
            {copy.jobDetail.refresh}
          </button>
          {envLink ? (
            <Link to={envLink} className="ghost action-link action-link-button">
              {copy.jobDetail.environment}
            </Link>
          ) : null}
          {canOpenControl && controlLink ? (
            <Link to={controlLink} className="ghost action-link action-link-button">
              {copy.jobDetail.approvalControl}
            </Link>
          ) : null}
          {canApply ? (
            <button
              disabled={applying}
              onClick={async () => {
                if (!job) return
                setApplying(true)
                setError(null)
                try {
                  const created = await jobs.apply(job.id)
                  nav(`/jobs/${created.id}`)
                } catch (err: any) {
                  setError(err?.message || 'failed to create apply job')
                } finally {
                  setApplying(false)
                }
              }}
            >
              {applying ? copy.jobDetail.applying : copy.jobDetail.applyPlan}
            </button>
          ) : null}
        </div>
      </section>

      {error ? <section className="error-box">{error}</section> : null}

      <section className="stats-grid">
        <article className="metric-card metric-card-primary">
          <span>{ko ? '상태' : 'Status'}</span>
          <strong>{status || '-'}</strong>
          <p>{ko ? '이 작업 기록의 현재 실행 상태입니다.' : 'Current execution state for this job record.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '작업' : 'Operation'}</span>
          <strong>{job?.operation || 'plan/apply'}</strong>
          <p>{ko ? '이 실행과 연결된 라이프사이클 변경 작업입니다.' : 'Lifecycle mutation associated with this execution.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '재시도 예산' : 'Retry budget'}</span>
          <strong>
            {job?.retry_count || 0} / {job?.max_retries || 0}
          </strong>
          <p>{ko ? '실행 ledger에 기록된 재시도 카운터입니다.' : 'Retry counters attached to the execution ledger.'}</p>
        </article>
        <article className="metric-card">
          <span>{ko ? '템플릿' : 'Template'}</span>
          <strong>{job?.template_name || '-'}</strong>
          <p>{ko ? '이 작업 렌더링에 사용된 고정 템플릿 경로입니다.' : 'Fixed template path used by the renderer for this job.'}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card console-card-span">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '실행 메타데이터' : 'Execution metadata'}</div>
              <h2>{ko ? '체인, 소스, 연결된 환경' : 'Chain, source, and linked environment'}</h2>
            </div>
          </div>
          <div className="info-grid info-grid-three">
            <div className="meta-item">
              <span>{ko ? '작업 ID' : 'Job ID'}</span>
              <strong>{job?.id || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '유형' : 'Type'}</span>
              <strong>{job?.type || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '상태' : 'Status'}</span>
              <StatusBadge status={status} />
            </div>
            <div className="meta-item">
              <span>{ko ? '소스 작업' : 'Source job'}</span>
              <strong>
                {job?.source_job_id ? <Link to={`/jobs/${job.source_job_id}`} className="text-link">{job.source_job_id.slice(0, 8)}</Link> : '-'}
              </strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '환경 ID' : 'Environment ID'}</span>
              <strong>
                {job?.environment_id && envLink ? <Link to={envLink} className="text-link">{job.environment_id}</Link> : job?.environment_id || '-'}
              </strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '요청자' : 'Requested by'}</span>
              <strong>{job?.requested_by || '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '생성 시각' : 'Created'}</span>
              <strong>{job?.created_at ? new Date(job.created_at).toLocaleString() : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '업데이트 시각' : 'Updated'}</span>
              <strong>{job?.updated_at ? new Date(job.updated_at).toLocaleString() : '-'}</strong>
            </div>
            <div className="meta-item">
              <span>{ko ? '템플릿' : 'Template'}</span>
              <strong>{job?.template_name || '-'}</strong>
            </div>
          </div>
          {job?.error ? <div className="error-box" style={{ marginTop: 14 }}>{ko ? '오류' : 'Error'}: {job.error}</div> : null}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '다음 작업' : 'Next action'}</div>
              <h2>{ko ? '운영자 가이드' : 'Operator guidance'}</h2>
            </div>
          </div>
          <div className="stack-list">
            {envLink ? (
              <Link to={envLink} className="stack-row stack-row-link">
                <div>
                  <strong>{ko ? '연결된 환경 열기' : 'Open linked environment'}</strong>
                  <div className="row-meta">{ko ? '라이프사이클 기록과 보호된 작업을 확인하려면 환경 레코드로 돌아갑니다.' : 'Return to the environment record for lifecycle history and guarded actions.'}</div>
                </div>
              </Link>
            ) : null}
            {canApply ? (
              <div className="stack-row">
                <div>
                  <strong>{ko ? '이 계획은 apply 준비가 끝났습니다' : 'Plan is ready to apply'}</strong>
                  <div className="row-meta">{ko ? '이 계획은 성공적으로 끝났고 apply에 필요한 산출물 경로를 가지고 있습니다.' : 'This plan finished successfully and has artifact pointers needed for apply.'}</div>
                </div>
              </div>
            ) : null}
            {canOpenControl && controlLink ? (
              <Link to={controlLink} className="stack-row stack-row-link">
                <div>
                  <strong>{ko ? '보호된 제어 열기' : 'Open guarded control'}</strong>
                  <div className="row-meta">{ko ? '전용 환경 변경 화면에서 승인, apply, destroy를 처리합니다.' : 'Approve, apply, or destroy from the dedicated environment mutation surface.'}</div>
                </div>
              </Link>
            ) : null}
            <div className="stack-row">
              <div>
                <strong>{ko ? '실시간 로그 확인' : 'Inspect live logs'}</strong>
                <div className="row-meta">{ko ? '러너가 연결된 동안 아래 스트림을 확인하세요. 과거 로그 파일 조회는 아직 제공되지 않습니다.' : 'Use the stream below while the runner is connected. Historical file retrieval is not exposed yet.'}</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '환경 페이로드' : 'Environment payload'}</div>
              <h2>{ko ? '렌더링된 목표 상태 요약' : 'Rendered desired state summary'}</h2>
            </div>
          </div>
          {env ? (
            <div className="info-grid">
              <div className="meta-item">
                <span>{ko ? '이름' : 'Name'}</span>
                <strong>{env.environment_name || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>{ko ? '테넌트' : 'Tenant'}</span>
                <strong>{env.tenant_name || '-'}</strong>
              </div>
              <div className="meta-item">
                <span>{ko ? '네트워크' : 'Network'}</span>
                <strong>{env.network?.name || '-'}</strong>
                <div className="row-meta">{env.network?.cidr || '-'}</div>
              </div>
              <div className="meta-item">
                <span>{ko ? '서브넷' : 'Subnet'}</span>
                <strong>{env.subnet?.name || '-'}</strong>
                <div className="row-meta">{env.subnet?.cidr || '-'}</div>
              </div>
              <div className="meta-item">
                <span>{ko ? '인스턴스' : 'Instances'}</span>
                <strong>{env.instances?.reduce((sum, item) => sum + (item.count || 0), 0) || 0}</strong>
              </div>
              <div className="meta-item">
                <span>{ko ? '보안 그룹' : 'Security groups'}</span>
                <strong>{env.security_groups?.length || 0}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">{ko ? '이 작업에는 환경 페이로드가 연결되어 있지 않습니다.' : 'No environment payload is attached to this job.'}</div>
          )}
        </article>

        <article className="console-card">
          <div className="section-head">
            <div>
              <div className="section-kicker">{ko ? '산출물' : 'Artifacts'}</div>
              <h2>{ko ? '작업 디렉터리와 결과 경로' : 'Workdir and result pointers'}</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-row">
              <div>
                <strong>{ko ? '작업 디렉터리' : 'Workdir'}</strong>
                <div className="row-meta">{job?.workdir || '-'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>{ko ? '계획 경로' : 'Plan path'}</strong>
                <div className="row-meta">{job?.plan_path || '-'}</div>
              </div>
            </div>
            <div className="stack-row">
              <div>
                <strong>{ko ? '로그 디렉터리' : 'Log directory'}</strong>
                <div className="row-meta">{job?.log_dir || '-'}</div>
              </div>
            </div>
          </div>
          {outputs ? (
            <pre className="json-block" style={{ marginTop: 14 }}>
              {JSON.stringify(outputs, null, 2)}
            </pre>
          ) : (
            <div className="empty-state" style={{ marginTop: 14 }}>
              {ko ? '이 실행에 기록된 구조화된 출력이 없습니다.' : 'No structured outputs were recorded for this execution.'}
            </div>
          )}
        </article>
      </section>

      <section className="console-card">
        <div className="section-head">
          <div>
            <div className="section-kicker">{ko ? '실시간 실행 로그' : 'Live execution log'}</div>
            <h2>{ko ? 'WebSocket 스트림' : 'WebSocket stream'}</h2>
          </div>
          <span className={`badge ${connected ? 'badge-running' : 'badge-muted'}`}>{connected ? (ko ? '실시간 추적 중' : 'tailing live') : ko ? '스트림 대기 중' : 'waiting for stream'}</span>
        </div>
        <div className="log-stream">
          {logs.length === 0 ? (
            <div className="empty-state">{ko ? '아직 스트리밍된 로그가 없습니다. 과거 로그 다운로드는 현재 API에서 제공되지 않습니다.' : 'No streamed logs yet. Historical log download is not exposed by the current API.'}</div>
          ) : (
            logs.map((entry) => (
              <div className="log-entry" key={entry.id}>
                <div className="log-meta">
                  <span className="log-file">{entry.file || 'stdout'}</span>
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{entry.message}</pre>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
