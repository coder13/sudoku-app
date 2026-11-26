import type { ReactNode, Ref } from 'react'

/** Share import status and action framing while callers retain family-specific previews. */
export function PuzzleImportPreview({ summary, summaryRef, hasProgress = false, error, actions, children }: {
  summary: ReactNode
  summaryRef?: Ref<HTMLParagraphElement>
  hasProgress?: boolean
  error?: string
  actions: ReactNode
  children: ReactNode
}) {
  return <div className="import-preview">
    <p className="import-preview-meta" ref={summaryRef} tabIndex={-1}>{summary}</p>
    {hasProgress && <p>This import includes your progress.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {children}
    <div className="dialog-actions import-preview-actions">{actions}</div>
  </div>
}
