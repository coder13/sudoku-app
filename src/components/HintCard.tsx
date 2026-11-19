import { Button, IconButton } from './Button'
import { ArrowLeft, ArrowRight, BookOpen, Eye, EyeOff, Lightbulb, X } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { HintRemoval, PuzzleHint } from '../sudoku/hints'
import type { lessonDiagram } from '../sudoku/lesson-diagram'

type HintNavigation = { index: number; count: number; onMove: (offset: -1 | 1) => void }
type HintAction = { label: string; onClick: () => void }

type ExplanationProps = {
  explanation?: string | readonly string[]
  explanationSteps?: readonly string[]
  collapseExplanation?: boolean
  trace?: ReturnType<typeof lessonDiagram>['trace']
}
type OutcomeProps = { removals?: readonly HintRemoval[]; text?: string }

export function HintCard({ hint, onClose, onShown, visuals, navigation, action, lessDetail, secondaryAction, lesson, removals, detail, ...explanation }: {
  hint: PuzzleHint
  onClose: () => void
  onShown?: () => void
  visuals?: { visible: boolean; onToggle: () => void }
  navigation?: HintNavigation
  action?: HintAction
  lessDetail?: { disabled: boolean; onClick: () => void }
  secondaryAction?: HintAction & { expanded?: boolean }
  lesson?: { id: string; title: string }
  detail?: ReactNode
  removals?: readonly HintRemoval[]
} & ExplanationProps) {
  const card = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (card.current?.getClientRects().length) onShown?.()
  }, [onShown])

  return (
    <aside className="hint-card" aria-label="Puzzle hint" ref={card}>
      <div className="hint-card-heading">
        <span className="hint-card-icon" aria-hidden="true"><Lightbulb size={19} /></span>
        <div className="hint-card-title">
          <small>Hint</small>
          <h2>{hint.title}</h2>
          {lesson && <a className="hint-card-lesson" href={`/learn/${lesson.id}`} aria-label={`Review ${lesson.title} lesson`}>
            <BookOpen size={14} aria-hidden="true" /> Review lesson
          </a>}
        </div>
        <div className="hint-card-heading-buttons">
          {visuals && <IconButton type="button" variant="quiet" className="hint-card-visuals"
            aria-label="Hint visuals" aria-pressed={visuals.visible} title={visuals.visible ? 'Hide hint visuals' : 'Show hint visuals'}
            onClick={visuals.onToggle}>
            {visuals.visible ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
          </IconButton>}
          <IconButton type="button" variant="quiet" className="hint-card-close" aria-label="Close hint" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>
        {(navigation || action || secondaryAction) && <div className="hint-card-actions">
          {navigation && <div className="hint-card-navigation" role="group" aria-label="Hint navigation">
            <IconButton type="button" aria-label="Previous hint"
              disabled={navigation.index === 0} onClick={() => navigation.onMove(-1)}>
              <ArrowLeft size={16} aria-hidden="true" />
            </IconButton>
            <span>{navigation.index + 1}/{navigation.count}</span>
            <IconButton type="button" aria-label="Next hint"
              disabled={navigation.count < 2} onClick={() => navigation.onMove(1)}>
              <ArrowRight size={16} aria-hidden="true" />
            </IconButton>
          </div>}
          {secondaryAction && <Button type="button" aria-expanded={secondaryAction.expanded}
            onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>}
          {action && <div className="hint-card-detail-actions" role="group" aria-label="Hint detail">
            {lessDetail && <Button type="button" disabled={lessDetail.disabled}
              onClick={lessDetail.onClick}>Less detail</Button>}
            <Button type="button" variant="primary" onClick={action.onClick}>{action.label}</Button>
          </div>}
        </div>}
      </div>
      <DeductionExplanation {...explanation} />
      {detail}
      <DeductionOutcome removals={removals} text={hint.text} />
    </aside>
  )
}

export function DeductionExplanation({ explanation, explanationSteps, collapseExplanation, trace }: ExplanationProps) {
  const paragraphs = typeof explanation === 'string' ? [explanation] : explanation ?? []
  return (
    <>
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
    </>
  )
}

export function DeductionOutcome({ removals, text }: OutcomeProps) {
  return removals?.length ? <section className="hint-card-removals" aria-label="Remove candidates">
    <h3>Remove candidates</h3>
    <ul>{removals.map(({ digit, cells }) => <li key={digit}>
      <strong>Digit {digit}</strong><span>{cells.join(' · ')}</span>
    </li>)}</ul>
  </section> : text ? <p>{text}</p> : null
}
