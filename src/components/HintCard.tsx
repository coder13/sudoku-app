import { ArrowLeft, ArrowRight, Lightbulb, X } from 'lucide-react'
import type { PuzzleHint } from '../sudoku/hints'

type HintNavigation = { index: number; count: number; onMove: (offset: -1 | 1) => void }

export function HintCard({ hint, onClose, navigation, onApply, explanation }: {
  hint: PuzzleHint
  onClose: () => void
  navigation?: HintNavigation
  onApply?: () => void
  explanation?: string
}) {
  return (
    <aside className="hint-card" aria-label="Puzzle hint">
      <div className="hint-card-heading">
        <span className="hint-card-icon" aria-hidden="true"><Lightbulb size={19} /></span>
        <div>
          <small>Hint</small>
          <h2>{hint.title}</h2>
        </div>
        {(navigation || onApply) && <div className="hint-card-actions">
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
          {onApply && <button type="button" className="button primary" onClick={onApply}>Apply hint</button>}
        </div>}
        <button type="button" className="icon-button borderless hint-card-close" aria-label="Close hint" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p>{hint.text}</p>
      {explanation && <details className="hint-card-explanation">
        <summary>Why this works</summary>
        <p>{explanation}</p>
      </details>}
    </aside>
  )
}
