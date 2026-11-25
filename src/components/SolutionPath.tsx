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

export function solutionCompletionSummary(trace: SolutionTrace): PuzzleHint {
  const proof = 'completionProof' in trace ? trace.completionProof : undefined
  return proof
    ? { title: 'Eight-digit Pattern Overlay', text: `Only one set of eight compatible layouts fits the puzzle. The eight layouts leave one cell in every row, column, and box for ${proof.omittedDigit}.` }
    : { title: 'Exact solution', text: 'The verified solution is shown.' }
}

export function solutionEndIndex(trace: SolutionTrace) {
  return trace.steps.length + Number('exactPosition' in trace && Boolean(trace.exactPosition))
}

function isPartialSolution(trace?: SolutionTrace) {
  return trace && solutionStatus(trace) === 'stalled' && !('exact' in trace && trace.exact)
    && !('completionProof' in trace && trace.completionProof)
}

export function solutionEndSummary(status: PuzzleRating['status'] | 'solved', exact?: true, overlayCompletion?: boolean): PuzzleHint {
  if (overlayCompletion) return { title: 'Last named position', text: 'The configured techniques have no move here.' }
  if (exact) return { title: 'Exact solution', text: 'Visible clues did not yield a complete logical path.' }
  return status === 'stalled'
    ? { title: 'Last position', text: 'The walkthrough ends before the puzzle is solved.' }
    : { title: 'Final grid', text: 'The solution is complete. The final grid is shown.' }
}

/** Keep the read-only preview and walkthrough together on a small screen. */
export function SolutionDialog({ grid, explanation, detail, ...props }: Props & {
  grid: ReactNode; explanation: { title: string; text: string } | null; detail?: ReactNode
}) {
  const partial = props.state.status === 'ready' && isPartialSolution(props.state.trace)
  return <Modal title={partial ? 'Partial solution' : 'Solution'} className="mobile-solution-dialog" onClose={props.onClose}>
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
  const endIndex = trace ? solutionEndIndex(trace) : 0
  const status = trace && solutionStatus(trace)
  const exact = trace && 'exact' in trace && trace.exact
  const partial = isPartialSolution(trace)
  const title = partial ? 'Partial solution' : 'Solution'
  const last = status && solutionEndSummary(status, exact || undefined, Boolean(trace && 'completionProof' in trace && trace.completionProof))
  const moveAvailability = trace && 'moveAvailability' in trace ? trace.moveAvailability : undefined
  const lastBottleneck = bottleneckLabel(moveAvailability?.[count])
  const finalRows = trace && last ? endIndex > count ? [last, solutionCompletionSummary(trace)] : [last] : []

  useEffect(() => {
    if (!embedded) close.current?.focus({ preventScroll: true })
  }, [embedded])

  useLayoutEffect(() => {
    if (endIndex > 0 || exact) onReveal?.()
  }, [endIndex, exact, onReveal])

  useEffect(() => {
    const viewport = list.current
    const row = viewport?.children[index]
    if (!viewport || !row) return
    const from = viewport.getBoundingClientRect()
    const to = row.getBoundingClientRect()
    if (to.top < from.top) viewport.scrollTop += to.top - from.top
    else if (to.bottom > from.bottom) viewport.scrollTop += to.bottom - from.bottom
  }, [index, endIndex])

  function navigate(event: KeyboardEvent<HTMLOListElement>) {
    const next = event.key === 'ArrowUp' ? Math.max(0, index - 1)
      : event.key === 'ArrowDown' ? Math.min(endIndex, index + 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? endIndex : undefined
    if (next === undefined) return
    event.preventDefault()
    onSelect(next)
    list.current?.children[next]?.querySelector('button')?.focus({ preventScroll: true })
  }

  return (
    <section className="surface solution-path" aria-label={title} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }}>
      {!embedded && <header className="solution-path-heading">
        <h2>{title}</h2>
        <IconButton ref={close} type="button" variant="quiet" onClick={onClose} aria-label="Return to puzzle" title="Return to puzzle">
          <X size={18} aria-hidden="true" />
        </IconButton>
      </header>}
      {partial && <p className="solution-path-message" role="status">This walkthrough ends with an incomplete grid.</p>}
      {status === 'stalled' && exact && <p className="solution-path-message" role="status">
        The logical walkthrough ends before the exact solution.
      </p>}
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
          {finalRows.map(({ title, text }, offset) => {
            const row = count + offset
            return <li key={title}>
              <button type="button" className="solution-path-step solution-path-last" aria-current={index === row ? 'step' : undefined}
                tabIndex={index === row ? 0 : -1} onClick={() => onSelect(row)}>
                <span>
                  <strong>{title}</strong>
                  {status === 'stalled' && <small>{text}</small>}
                  {offset === 0 && lastBottleneck && <small className="solution-step-bottleneck">{lastBottleneck}</small>}
                </span>
              </button>
            </li>
          })}
        </ol>
        <footer className="solution-path-footer">
          <div className="solution-path-navigation">
            <IconButton type="button" aria-label="Previous step" disabled={index === 0} onClick={() => onSelect(index - 1)}><ArrowLeft size={16} /></IconButton>
            <span role="status">{index < count ? `Step ${index + 1} of ${count}` : finalRows[index - count]?.title}</span>
            <IconButton type="button" aria-label="Next step" disabled={index >= endIndex} onClick={() => onSelect(index + 1)}><ArrowRight size={16} /></IconButton>
          </div>
        </footer>
      </>}
    </section>
  )
}
