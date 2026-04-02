import React from 'react'

type Props = {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const normalized = status.toLowerCase()
  let className = 'badge'
  if (['queued', 'pending', 'pending_approval', 'not_requested'].includes(normalized)) className += ' badge-queued'
  else if (['running', 'planning', 'applying', 'approved', 'destroying'].includes(normalized)) className += ' badge-running'
  else if (['done', 'active', 'destroyed'].includes(normalized)) className += ' badge-done'
  else if (normalized === 'failed') className += ' badge-failed'
  else className += ' badge-muted'

  return <span className={className}>{status || 'unknown'}</span>
}
