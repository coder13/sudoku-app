import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { Difficulty, LogicalSolution, MoveAvailability } from '../sudoku/engine'
import { techniqueLabel, type CellReferenceStyle } from '../sudoku/hints'
import { deductionResults } from '../sudoku/lesson-diagram'
import { Modal } from './Modal'

export type SolutionPathState =
  | { status: 'loading' }
  | { status: 'ready'; trace: LogicalSolution }
  | { status: 'unavailable'; message: string }

type Props = {
  state: SolutionPathState
  index: number
  onSelect: (index: number) => void
  onRetry: () => void
  onClose: () => void
  onReveal?: () => void
  embedded?: boolean
  cellReferenceStyle?: CellReferenceStyle
  techniqueDifficulties?: Readonly<Partial<Record<string, Difficulty>>>
}

/** Keep the read-only preview and walkthrough together on a small screen. */
export function SolutionDialog({ grid, explanation, ...props }: Props & {
  grid: ReactNode; explanation: { title: string; text: string } | null
}) {
  return <Modal title="Solution" className="mobile-solution-dialog" onClose={props.onClose}>
    {grid}
    {explanation && <div className="mobile-solution-explanation">
      <h3>{explanation.title}</h3><p>{explanation.text}</p>
    </div>}
    <SolutionPath {...props} embedded />
  </Modal>
}

function bottleneckLabel(availability?: MoveAvailability) {
  if (!availability?.bottleneck) return undefined
  return availability.easyMoves === 0 ? 'No easy moves' : 'Only one easy move'
}

export function SolutionPath({ state, index, onSelect, onRetry, onClose, onReveal, embedded = false,
  cellReferenceStyle, techniqueDifficulties }: Props) {
  const list = useRef<HTMLOListElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const steps = state.status === 'ready' ? state.trace.steps : undefined
  const count = steps?.length ?? 0
  const finished = state.status === 'ready' && state.trace.rating.status !== 'stalled'
  const lastLabel = finished ? 'Final grid' : 'Last position'
  const moveAvailability = state.status === 'ready' ? state.trace.moveAvailability : undefined
  const lastBottleneck = bottleneckLabel(moveAvailability?.[count])

  useEffect(() => {
    if (!embedded) close.current?.focus({ preventScroll: true })
  }, [embedded])

  useLayoutEffect(() => {
    if (count > 0) onReveal?.()
  }, [count, onReveal])

  useEffect(() => {
    const viewport = list.current
    const row = viewport?.children[index]
    if (!viewport || !row) return
    const from = viewport.getBoundingClientRect()
    const to = row.getBoundingClientRect()
    if (to.top < from.top) viewport.scrollTop += to.top - from.top
    else if (to.bottom > from.bottom) viewport.scrollTop += to.bottom - from.bottom
  }, [index, count])

  function navigate(event: KeyboardEvent<HTMLOListElement>) {
    const next = event.key === 'ArrowUp' ? Math.max(0, index - 1)
      : event.key === 'ArrowDown' ? Math.min(count, index + 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? count : undefined
    if (next === undefined) return
    event.preventDefault()
    onSelect(next)
    list.current?.children[next]?.querySelector('button')?.focus({ preventScroll: true })
  }

  return (
    <section className="surface solution-path" aria-label="Solution" onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }}>
      <header className="solution-path-heading">
        <div>
          {!embedded && <h2>Solution</h2>}
          {steps && <p>{count} {count === 1 ? 'step' : 'steps'} from the givens</p>}
        </div>
        {!embedded && <button ref={close} type="button" className="icon-button borderless" onClick={onClose} aria-label="Return to puzzle" title="Return to puzzle">
          <X size={18} aria-hidden="true" />
        </button>}
      </header>
      {state.status === 'loading' && <p className="solution-path-message" role="status">Finding the steps…</p>}
      {state.status === 'unavailable' && <div className="solution-path-message">
        <p role="status">{state.message}</p>
        <button type="button" className="button secondary" onClick={onRetry}>Try again</button>
      </div>}
      {steps && <>
        <ol className="solution-path-steps" ref={list} role="list" aria-label="Solving steps" onKeyDown={navigate}>
          {steps.map((step, stepIndex) => {
            const bottleneck = bottleneckLabel(moveAvailability?.[stepIndex])
            return <li key={stepIndex}>
              <button type="button" className="solution-path-step" aria-current={index === stepIndex ? 'step' : undefined}
                tabIndex={index === stepIndex ? 0 : -1} onClick={() => onSelect(stepIndex)}>
                <span className="solution-step-number">{stepIndex + 1}</span>
                <span>
                  <strong>{techniqueLabel(step.technique)}</strong>
                  <small>{deductionResults(step.actions, { cellReferenceStyle, difficulty: techniqueDifficulties?.[step.technique] }).join(' ')}</small>
                  {bottleneck && <small className="solution-step-bottleneck">{bottleneck}</small>}
                </span>
              </button>
            </li>
          })}
          <li>
            <button type="button" className="solution-path-step solution-path-last" aria-current={index === count ? 'step' : undefined}
              tabIndex={index === count ? 0 : -1} onClick={() => onSelect(count)}>
              <span>
                <strong>{lastLabel}</strong>
                {!finished && <small>The solver reached the end of its available moves.</small>}
                {lastBottleneck && <small className="solution-step-bottleneck">{lastBottleneck}</small>}
              </span>
            </button>
          </li>
        </ol>
        <footer className="solution-path-footer">
          <div className="solution-path-navigation">
            <button type="button" className="icon-button" aria-label="Previous step" disabled={index === 0} onClick={() => onSelect(index - 1)}><ArrowLeft size={16} /></button>
            <span role="status">{index < count ? `Step ${index + 1} of ${count}` : lastLabel}</span>
            <button type="button" className="icon-button" aria-label="Next step" disabled={index >= count} onClick={() => onSelect(index + 1)}><ArrowRight size={16} /></button>
          </div>
        </footer>
      </>}
    </section>
  )
}
