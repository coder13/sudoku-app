import { useState, type CSSProperties } from 'react'
import type { DiagramStep } from '../sudoku/lesson-diagram'

export function useDiagramSteps(steps: readonly DiagramStep[] | undefined) {
  const [selection, setSelection] = useState<{ steps: readonly DiagramStep[]; index: number }>()
  if (!steps) return
  const index = selection?.steps === steps ? selection.index : 1
  return { steps, index, annotations: steps[index].annotations, onSelect: (index: number) => setSelection({ steps, index }) }
}

export function DiagramSteps({ steps, index, onSelect }: Omit<NonNullable<ReturnType<typeof useDiagramSteps>>, 'annotations'>) {
  const { text, key } = steps[index]
  return <div className="diagram-steps">
    <div className="diagram-step-buttons" role="group" aria-label="Diagram steps">
      {steps.map(({ label, text }, step) => <button type="button" key={step} className="button secondary"
        aria-pressed={index === step} title={text} onClick={() => onSelect(step)}>{label}</button>)}
    </div>
    <div aria-live="polite">
      {text && <p>{text}</p>}
      {key && <ul className="diagram-set-key">
        {key.map(({ label, fill, cells }) => <li key={label}>
          <span className="diagram-set-swatch" style={{ '--set-swatch': fill } as CSSProperties} aria-hidden="true" />
          <span><strong>{label}</strong> {cells}</span>
        </li>)}
      </ul>}
    </div>
  </div>
}
