import { ArrowLeft, ArrowRight, BookOpen, Lightbulb, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { HintRemoval, PuzzleHint } from '../sudoku/hints'
import type { lessonDiagram } from '../sudoku/lesson-diagram'

type HintNavigation = { index: number; count: number; onMove: (offset: -1 | 1) => void }
type HintAction = { label: string; onClick: () => void }

export function HintCard({ hint, onClose, onShown, navigation, action, secondaryAction, explanation, explanationSteps, collapseExplanation, trace, lesson, removals }: {
  hint: PuzzleHint
  onClose: () => void
  onShown?: () => void
  navigation?: HintNavigation
  action?: HintAction
  secondaryAction?: HintAction & { expanded?: boolean }
  explanation?: string | readonly string[]
  explanationSteps?: readonly string[]
  collapseExplanation?: boolean
  trace?: ReturnType<typeof lessonDiagram>['trace']
  lesson?: { id: string; title: string }
  removals?: readonly HintRemoval[]
}) {
  const card = useRef<HTMLElement>(null)
  const paragraphs = typeof explanation === 'string' ? [explanation] : explanation ?? []
  useLayoutEffect(() => {
    if (card.current?.getClientRects().length) onShown?.()
  }, [onShown])

  return (
    <aside className="hint-card" aria-label="Puzzle hint" ref={card}>
      <div className="hint-card-heading">
        <span className="hint-card-icon" aria-hidden="true"><Lightbulb size={19} /></span>
        <div>
          <small>Hint</small>
          <h2>{hint.title}</h2>
          {lesson && <a className="hint-card-lesson" href={`/learn/${lesson.id}`} aria-label={`Review ${lesson.title} lesson`}>
            <BookOpen size={14} aria-hidden="true" /> Review lesson
          </a>}
        </div>
        <button type="button" className="icon-button borderless hint-card-close" aria-label="Close hint" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        {(navigation || action || secondaryAction) && <div className="hint-card-actions">
          {navigation && <div className="hint-card-navigation" role="group" aria-label="Hint navigation">
            <button type="button" className="icon-button" aria-label="Previous hint"
              disabled={navigation.index === 0} onClick={() => navigation.onMove(-1)}>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <span>{navigation.index + 1}/{navigation.count}</span>
            <button type="button" className="icon-button" aria-label="Next hint"
              disabled={navigation.count < 2} onClick={() => navigation.onMove(1)}>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>}
          {secondaryAction && <button type="button" className="button secondary" aria-expanded={secondaryAction.expanded}
            onClick={secondaryAction.onClick}>{secondaryAction.label}</button>}
          {action && <button type="button" className="button primary" onClick={action.onClick}>{action.label}</button>}
        </div>}
      </div>
      {(paragraphs.length > 0 || Boolean(explanationSteps?.length)) && (collapseExplanation ? <details className="hint-card-explanation">
        <summary>Why this works</summary>
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {explanationSteps?.length ? <ol className="hint-reason-steps">{explanationSteps.map((step, index) => <li key={index}>{step}</li>)}</ol> : null}
      </details> : <section className="hint-card-reason" aria-label="Why this works">
        <h3>Why this works</h3>
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {explanationSteps?.length ? <ol className="hint-reason-steps">{explanationSteps.map((step, index) => <li key={index}>{step}</li>)}</ol> : null}
      </section>)}
      {trace && <details className="hint-card-explanation">
        <summary>Read the proof step by step</summary>
        {trace.map(({ assumption, steps, conclusion }, index) => <div key={index}>
          <p>{assumption}</p>
          <ol>{steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
          <p>{conclusion}</p>
        </div>)}
      </details>}
      {removals?.length ? <section className="hint-card-removals" aria-label="Remove candidates">
        <h3>Remove candidates</h3>
        <ul>{removals.map(({ digit, cells }) => <li key={digit}>
          <strong>Digit {digit}</strong><span>{cells.join(' · ')}</span>
        </li>)}</ul>
      </section> : hint.text && <p>{hint.text}</p>}
    </aside>
  )
}
