import React from 'react'
import { useI18n } from '../i18n'

type Props = {
  status: string
}

export function formatStatusLabel(status: string | undefined, ko = false): string {
  if (!status) return ko ? '알 수 없음' : 'unknown'
  const normalized = status.toLowerCase()
  const labelMap: Record<string, string> = {
    queued: '대기',
    pending: '보류',
    pending_approval: '승인 대기',
    not_requested: '미요청',
    running: '실행 중',
    planning: '계획 중',
    applying: '적용 중',
    approved: '승인됨',
    destroying: '삭제 중',
    done: '완료',
    active: '활성',
    destroyed: '삭제됨',
    failed: '실패',
  }
  return ko ? labelMap[normalized] || status : status
}

export default function StatusBadge({ status }: Props) {
  const { locale } = useI18n()
  const ko = locale === 'ko'
  const normalized = status.toLowerCase()
  let className = 'badge'
  if (['queued', 'pending', 'pending_approval', 'not_requested'].includes(normalized)) className += ' badge-queued'
  else if (['running', 'planning', 'applying', 'approved', 'destroying'].includes(normalized)) className += ' badge-running'
  else if (['done', 'active', 'destroyed'].includes(normalized)) className += ' badge-done'
  else if (normalized === 'failed') className += ' badge-failed'
  else className += ' badge-muted'

  return <span className={className}>{formatStatusLabel(status, ko)}</span>
}
