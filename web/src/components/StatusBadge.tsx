import React from 'react'

type Props = {
  status: string
}

export default function StatusBadge({ status }: Props) {
  const normalized = status.toLowerCase()
  let className = 'badge'
  if (normalized === 'queued') className += ' badge-queued'
  else if (normalized === 'running') className += ' badge-running'
  else if (normalized === 'done') className += ' badge-done'
  else if (normalized === 'failed') className += ' badge-failed'
  else className += ' badge-muted'

  return <span className={className}>{status || 'unknown'}</span>
}

