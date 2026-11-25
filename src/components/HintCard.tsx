import { Button, IconButton } from './Button'
import { ArrowLeft, ArrowRight, BookOpen, Eye, EyeOff, Lightbulb, X } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { HintRemoval, PuzzleHint } from '../sudoku/hints'
import type { lessonDiagram } from '../sudoku/lesson-diagram'

type HintNavigation = { index: number; count: number; onMove: (offset: -1 | 1) => void }
type HintDetailNavigation = { first: boolean; last: boolean; onMove: (offset: -1 | 1) => void }
type HintAction = { label: string; onClick: () => void; shortcut?: string }

type ExplanationProps = {
  explanation?: string | readonly string[]
  explanationSteps?: readonly string[]
  collapseExplanation?: boolean
  trace?: ReturnType<typeof lessonDiagram>['trace']
}
type OutcomeProps = { removals?: readonly HintRemoval[]; text?: string }

export function HintCard({ compact = false, hint, onClose, onShown, visuals, reserveVisuals, navigation, action, detailNavigation, secondaryAction, lesson, removals, detail, ...explanation }: {
  compact?: boolean
  hint: PuzzleHint
  onClose: () => void
  onShown?: () => void
  visuals?: { visible: boolean; onToggle: () => void }
  reserveVisuals?: boolean
  navigation?: HintNavigation
  action?: HintAction
  detailNavigation?: HintDetailNavigation
  secondaryAction?: HintAction & { expanded?: boolean; reserved?: boolean }
  lesson?: { id: string; title: string }
  detail?: ReactNode
  removals?: readonly HintRemoval[]
} & ExplanationProps) {
  const card = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (card.current?.getClientRects().length) onShown?.()
  }, [onShown])
  const reserveAction = detailNavigation && !detailNavigation.last

  const closeButton = <IconButton type="button" variant="quiet" className="hint-card-close" aria-label="Close hint" onClick={onClose}>
    <X size={18} aria-hidden="true" />
  </IconButton>
  const hintNavigation = navigation && <div className="hint-card-navigation" role="group" aria-label="Hint navigation">
    <IconButton type="button" aria-label="Previous hint"
      disabled={navigation.index === 0} onClick={() => navigation.onMove(-1)}>
      <ArrowLeft size={16} aria-hidden="true" />
    </IconButton>
    <span>{navigation.index + 1}/{navigation.count}</span>
    <IconButton type="button" aria-label="Next hint"
      disabled={navigation.count < 2} onClick={() => navigation.onMove(1)}>
      <ArrowRight size={16} aria-hidden="true" />
    </IconButton>
  </div>
  const lessonLink = lesson && <a className="hint-card-lesson" href={`/learn/${lesson.id}`} aria-label={`Review ${lesson.title} lesson`}
    title={compact ? 'Review lesson' : undefined}>
    <BookOpen size={14} aria-hidden="true" />{!compact && ' Review lesson'}
  </a>

  const content = (
    <aside className="hint-card" aria-label="Puzzle hint" data-compact={compact || undefined}
      data-staged={Boolean(detailNavigation) || undefined} ref={card}>
      <div className="hint-card-heading">
        {!compact && <span className="hint-card-icon" aria-hidden="true"><Lightbulb size={19} /></span>}
        <div className="hint-card-summary">
          <div className="hint-card-title">
            {!compact && <small>Hint</small>}
            <h2>{hint.title}</h2>
            {!compact && lessonLink}
          </div>
          {compact && lessonLink}
          {visuals ? <IconButton type="button" variant="quiet" className="hint-card-visuals"
            aria-label="Hint visuals" aria-pressed={visuals.visible} title={visuals.visible ? 'Hide hint visuals' : 'Show hint visuals'}
            onClick={visuals.onToggle}>
            {visuals.visible ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
          </IconButton> : reserveVisuals && <span className="hint-card-visuals-space" aria-hidden="true" />}
        </div>
        {!compact && closeButton}
        {((!compact && navigation) || action || detailNavigation || secondaryAction) && <div className="hint-card-actions">
          {!compact && hintNavigation}
          {secondaryAction && <Button type="button" aria-expanded={secondaryAction.expanded} data-reserved={secondaryAction.reserved || undefined}
            disabled={secondaryAction.reserved}
            onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>}
          {(action || detailNavigation) && <div className="hint-card-detail-actions" role="group" aria-label="Hint detail">
            {action && <Button type="button" variant="primary" disabled={reserveAction} data-reserved={reserveAction || undefined}
              onClick={action.onClick} aria-keyshortcuts={action.shortcut}
              title={action.shortcut ? `${action.label} (${action.shortcut})` : undefined}>{action.label}</Button>}
            {detailNavigation && <>
              <IconButton aria-label="Less detail" title="Less detail" aria-disabled={detailNavigation.first || undefined}
                tabIndex={detailNavigation.first ? -1 : undefined} onClick={detailNavigation.first ? undefined : () => detailNavigation.onMove(-1)}>
                <ArrowLeft size={18} aria-hidden="true" />
              </IconButton>
              <IconButton aria-label="More detail" title="More detail" aria-disabled={detailNavigation.last || undefined}
                tabIndex={detailNavigation.last ? -1 : undefined} onClick={detailNavigation.last ? undefined : () => detailNavigation.onMove(1)}>
                <ArrowRight size={18} aria-hidden="true" />
              </IconButton>
            </>}
          </div>}
        </div>}
      </div>
      <div className="hint-card-body">
        <DeductionExplanation {...explanation} />
        {detail}
        <DeductionOutcome removals={removals} text={hint.text} />
      </div>
    </aside>
  )
  return compact ? <>
    <div className="hint-toolbar">{hintNavigation}{closeButton}</div>
    {content}
  </> : content
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
