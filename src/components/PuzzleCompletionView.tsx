import { createPortal } from 'react-dom'
import { CircleCheck } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

export type CompletionFact = { label: string; value: ReactNode }

/** Render completion details without owning puzzle generation, persistence, or navigation. */
export function PuzzleCompletionView({ title = 'Puzzle solved', subtitle, showGuides, practiceMode = false,
  practice, results, rating, stats, details, actions, actionsTarget }: {
  title?: string
  subtitle?: ReactNode
  showGuides: boolean
  practiceMode?: boolean
  practice?: ReactNode
  results: readonly CompletionFact[]
  rating?: ReactNode
  stats?: readonly CompletionFact[]
  details?: ReactNode
  actions: ReactNode
  actionsTarget?: HTMLElement | null
}) {
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  return <section className={`board-frame completion-frame ${showGuides ? '' : 'guides-hidden'}`} aria-labelledby={`${id}-title`}>
    <div className="completion completion-results" data-practice={practiceMode || undefined}>
      <div className="completion-summary" role="region" aria-label="Solve details" tabIndex={0}>
        <header className="completion-heading">
          <span className="completion-icon" aria-hidden="true"><CircleCheck size={29} /></span>
          <h1 id={`${id}-title`} ref={heading} tabIndex={-1}>{title}</h1>
          {subtitle != null && <p>{subtitle}</p>}
        </header>
        {practice}
        {results.length > 0 && <dl className="completion-result">
          {results.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>}
        {rating}
        {stats && stats.length > 0 && <dl className="completion-stats">
          {stats.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>}
        {details}
      </div>
      {actionsTarget ? createPortal(actions, actionsTarget) : actions}
    </div>
  </section>
}
