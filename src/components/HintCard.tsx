import { Button, IconButton } from './Button'
import { ArrowLeft, ArrowRight, BookOpen, Eye, EyeOff, Pin, PinOff, X } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
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

export function HintCard({ hint, onClose, onShown, visuals, pinned, onTogglePinned, navigation, action, detailNavigation, secondaryAction, lesson, removals, detail, layoutAnchors, ...explanation }: {
  hint: PuzzleHint
  onClose: () => void
  onShown?: () => void
  visuals?: { visible: boolean; onToggle: () => void }
  pinned?: boolean
  onTogglePinned?: () => void
  navigation?: HintNavigation
  action?: HintAction
  detailNavigation?: HintDetailNavigation
  secondaryAction?: HintAction & { expanded?: boolean; reserved?: boolean }
  lesson?: { id: string; title: string }
  detail?: ReactNode
  removals?: readonly HintRemoval[]
  layoutAnchors?: {
    card: RefObject<HTMLElement | null>
    body: RefObject<HTMLDivElement | null>
    toolbar: RefObject<HTMLDivElement | null>
  }
} & ExplanationProps) {
  const internalCard = useRef<HTMLElement>(null)
  const card = layoutAnchors?.card ?? internalCard
  useLayoutEffect(() => {
    if (card.current?.getClientRects().length) onShown?.()
  }, [onShown])
  const reserveAction = detailNavigation && !detailNavigation.last

  const closeButton = <IconButton type="button" variant="quiet" className="hint-card-close" data-hint-card-close aria-label="Close hint" onClick={onClose}>
    <X size={18} aria-hidden="true" />
  </IconButton>
  const pinButton = onTogglePinned && <IconButton type="button" variant="quiet" className="hint-card-pin" data-hint-card-pin
    aria-label={pinned ? 'Show hint above the input' : 'Pin hint in input tabs'} aria-pressed={pinned}
    title={pinned ? 'Show hint separately' : 'Pin hint in input tabs'} onClick={onTogglePinned}>
    {pinned ? <PinOff size={18} aria-hidden="true" /> : <Pin size={18} aria-hidden="true" />}
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
    title="Review lesson">
    <BookOpen size={14} aria-hidden="true" />
  </a>

  const content = (
    <aside className="hint-card" aria-label="Puzzle hint" data-staged={Boolean(detailNavigation) || undefined} ref={card}>
      <div className="hint-card-heading">
        <div className="hint-card-summary">
          <div className="hint-card-title">
            <h2>{hint.title}</h2>
          </div>
          {lessonLink}
          {visuals ? <IconButton type="button" variant="quiet" className="hint-card-visuals" data-candidate-paint-focus-keep
            aria-label="Hint visuals" aria-pressed={visuals.visible} title={visuals.visible ? 'Hide hint visuals' : 'Show hint visuals'}
            onClick={visuals.onToggle}>
            {visuals.visible ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
          </IconButton> : <span className="hint-card-visuals-space" aria-hidden="true" />}
        </div>
        {(action || detailNavigation || secondaryAction) && <div className="hint-card-actions">
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
      <div className="hint-card-body" ref={layoutAnchors?.body}>
        <DeductionExplanation {...explanation} />
        {detail}
        <DeductionOutcome removals={removals} text={hint.text} />
      </div>
    </aside>
  )
  return <>
    <div className="hint-toolbar" ref={layoutAnchors?.toolbar}>{hintNavigation}<div className="hint-toolbar-actions">{pinButton}{closeButton}</div></div>
    {content}
  </>
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
