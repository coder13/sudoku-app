import { Button, IconButton } from './Button'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { Difficulty, LogicalSolution, MoveAvailability, PuzzleRating } from '../sudoku/engine'
import type { MiniSolutionTrace } from '../sudoku/mini-play'
import { techniqueLabel, type CellReferenceStyle, type PuzzleHint } from '../sudoku/hints'
import { deductionResults } from '../sudoku/lesson-diagram'
import { Modal } from './Modal'

type SudokuSolutionTrace = LogicalSolution | MiniSolutionTrace
export type NumberSolutionTrace = { status: 'solved' | 'stalled'; steps: readonly PuzzleHint[] }
type SolutionTrace = SudokuSolutionTrace | NumberSolutionTrace

export type SolutionPathState<Trace = SudokuSolutionTrace> =
  | { status: 'loading' }
  | { status: 'ready'; trace: Trace }
  | { status: 'unavailable'; message: string }

type Props = {
  state: SolutionPathState<SolutionTrace>
  index: number
  onSelect: (index: number) => void
  onRetry: () => void
  onClose: () => void
  onReveal?: () => void
  embedded?: boolean
  cellReferenceStyle?: CellReferenceStyle
  gridSize?: number
  techniqueDifficulties?: Readonly<Partial<Record<string, Difficulty>>>
}

export function solutionStatus(trace: SolutionTrace) {
  return 'rating' in trace ? trace.rating.status : trace.status
}

export function solutionEndSummary(status: PuzzleRating['status'] | 'solved'): PuzzleHint {
  return status === 'stalled'
    ? { title: 'Last position', text: 'The solver reached the end of its available moves.' }
    : { title: 'Final grid', text: 'The solution is complete. The final grid is shown.' }
}

/** Keep the read-only preview and walkthrough together on a small screen. */
export function SolutionDialog({ grid, explanation, detail, ...props }: Props & {
  grid: ReactNode; explanation: { title: string; text: string } | null; detail?: ReactNode
}) {
  return <Modal title="Solution" className="mobile-solution-dialog" onClose={props.onClose}>
    {grid}
    {explanation && <div className="mobile-solution-explanation">
      <h3>{explanation.title}</h3>{explanation.text && <p>{explanation.text}</p>}{detail}
    </div>}
    <SolutionPath {...props} embedded />
  </Modal>
}

function bottleneckLabel(availability?: MoveAvailability) {
  if (!availability?.bottleneck) return undefined
  return availability.easyMoves === 0 ? 'No easy moves' : 'Only one easy move'
}

export function SolutionPath({ state, index, onSelect, onRetry, onClose, onReveal, embedded = false,
  cellReferenceStyle, gridSize, techniqueDifficulties }: Props) {
  const list = useRef<HTMLOListElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const trace = state.status === 'ready' ? state.trace : undefined
  const count = trace?.steps.length ?? 0
  const status = trace && solutionStatus(trace)
  const last = status && solutionEndSummary(status)
  const moveAvailability = trace && 'moveAvailability' in trace ? trace.moveAvailability : undefined
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
      {!embedded && <header className="solution-path-heading">
        <h2>Solution</h2>
        <IconButton ref={close} type="button" variant="quiet" onClick={onClose} aria-label="Return to puzzle" title="Return to puzzle">
          <X size={18} aria-hidden="true" />
        </IconButton>
      </header>}
      {state.status === 'loading' && <p className="solution-path-message" role="status">Finding the steps…</p>}
      {state.status === 'unavailable' && <div className="solution-path-message">
        <p role="status">{state.message}</p>
        <Button type="button" onClick={onRetry}>Try again</Button>
      </div>}
      {trace && last && <>
        <ol className="solution-path-steps" ref={list} role="list" aria-label="Solving steps" onKeyDown={navigate}>
          {trace.steps.map((step, stepIndex) => {
            const bottleneck = bottleneckLabel(moveAvailability?.[stepIndex])
            const title = 'title' in step ? step.title : techniqueLabel(step.technique)
            const text = 'text' in step ? step.text : deductionResults(step.actions,
              { cellReferenceStyle, gridSize, difficulty: techniqueDifficulties?.[step.technique] }).join(' ')
            return <li key={stepIndex}>
              <button type="button" className="solution-path-step" aria-current={index === stepIndex ? 'step' : undefined}
                tabIndex={index === stepIndex ? 0 : -1} onClick={() => onSelect(stepIndex)}>
                <span className="solution-step-number">{stepIndex + 1}</span>
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                  {bottleneck && <small className="solution-step-bottleneck">{bottleneck}</small>}
                </span>
              </button>
            </li>
          })}
          <li>
            <button type="button" className="solution-path-step solution-path-last" aria-current={index === count ? 'step' : undefined}
              tabIndex={index === count ? 0 : -1} onClick={() => onSelect(count)}>
              <span>
                <strong>{last.title}</strong>
                {status === 'stalled' && <small>{last.text}</small>}
                {lastBottleneck && <small className="solution-step-bottleneck">{lastBottleneck}</small>}
              </span>
            </button>
          </li>
        </ol>
        <footer className="solution-path-footer">
          <div className="solution-path-navigation">
            <IconButton type="button" aria-label="Previous step" disabled={index === 0} onClick={() => onSelect(index - 1)}><ArrowLeft size={16} /></IconButton>
            <span role="status">{index < count ? `Step ${index + 1} of ${count}` : last.title}</span>
            <IconButton type="button" aria-label="Next step" disabled={index >= count} onClick={() => onSelect(index + 1)}><ArrowRight size={16} /></IconButton>
          </div>
        </footer>
      </>}
    </section>
  )
}
