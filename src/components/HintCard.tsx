import { ArrowLeft, ArrowRight, Lightbulb, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { PuzzleHint } from '../sudoku/hints'
import type { lessonDiagram } from '../sudoku/lesson-diagram'

type HintNavigation = { index: number; count: number; onMove: (offset: -1 | 1) => void }

export function HintCard({ hint, onClose, onShown, navigation, action, explanation, collapseExplanation, trace }: {
  hint: PuzzleHint
  onClose: () => void
  onShown?: () => void
  navigation?: HintNavigation
  action?: { label: string; onClick: () => void }
  explanation?: string
  collapseExplanation?: boolean
  trace?: ReturnType<typeof lessonDiagram>['trace']
}) {
  const card = useRef<HTMLElement>(null)
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
        </div>
        <button type="button" className="icon-button borderless hint-card-close" aria-label="Close hint" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        {(navigation || action) && <div className="hint-card-actions">
          {navigation && <div className="hint-card-navigation" role="group" aria-label="Hint navigation">
            <button type="button" className="icon-button" aria-label="Previous hint"
              disabled={navigation.index === 0} onClick={() => navigation.onMove(-1)}>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <span>{navigation.index + 1}/{navigation.count}</span>
            <button type="button" className="icon-button" aria-label="Next hint"
              disabled={navigation.index + 1 === navigation.count} onClick={() => navigation.onMove(1)}>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>}
          {action && <button type="button" className="button primary" onClick={action.onClick}>{action.label}</button>}
        </div>}
      </div>
      {hint.text && <p>{hint.text}</p>}
      {explanation && (collapseExplanation ? <details className="hint-card-explanation">
        <summary>Why this works</summary>
        <p>{explanation}</p>
      </details> : <p>{explanation}</p>)}
      {trace && <details className="hint-card-explanation">
        <summary>Read the proof step by step</summary>
        {trace.map(({ assumption, steps, conclusion }, index) => <div key={index}>
          <p>{assumption}</p>
          <ol>{steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
          <p>{conclusion}</p>
        </div>)}
      </details>}
    </aside>
  )
}
