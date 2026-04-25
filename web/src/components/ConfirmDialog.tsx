import React, { useEffect, useRef } from 'react'

type ConfirmDialogDetail = {
  label: string
  value: string
}

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  tone?: 'warning' | 'danger'
  details?: ConfirmDialogDetail[]
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'warning',
  details = [],
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, open])

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className={`dialog-card dialog-card-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <div className="section-head">
          <div>
            <div className="section-kicker">{tone === 'danger' ? 'High Risk' : 'Confirmation'}</div>
            <h2 id="confirm-dialog-title">{title}</h2>
          </div>
          <span className={`badge ${tone === 'danger' ? 'badge-failed' : 'badge-queued'}`}>
            {tone === 'danger' ? 'Risk' : 'Review'}
          </span>
        </div>
        <p id="confirm-dialog-description" className="dialog-description">
          {description}
        </p>
        {details.length > 0 ? (
          <div className="info-grid dialog-details">
            {details.map((item) => (
              <div className="meta-item" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value || '-'}</strong>
              </div>
            ))}
          </div>
        ) : null}
        <div className="detail-actions dialog-actions">
          <button ref={cancelRef} type="button" className="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={tone === 'danger' ? 'danger-action' : ''} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
