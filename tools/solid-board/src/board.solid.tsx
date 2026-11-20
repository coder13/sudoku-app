/** @jsxImportSource @solidjs/web */
import { For, Show, createSignal, createStore, onCleanup } from 'solid-js'
import { render } from '@solidjs/web'
import {
  DIGITS, candidateClass, candidateGridArea, cellInputs, describeCell, noopCell,
  type BoardAdapter, type BoardState, type CellInput,
} from './model'

const EXIT_CLEANUP_FALLBACK_MS = 250
const CELL_FIELDS = [
  'index', 'value', 'given', 'mask', 'color', 'candidateColors',
  'selected', 'active', 'related', 'focusDigit',
] as const satisfies readonly (keyof CellInput)[]

type FadePhase = 'enter' | 'exit' | undefined
type Mark = { digit: number; className: string }
type MarkAppearance = { className: string; phase: FadePhase }

/** Matches BoardMarks: retain removed marks, freeze their appearance, and reuse returning keys. */
function createMarks(initial: Mark[]) {
  let current = initial
  let exiting: number[] = []
  let entering = new Set<number>()
  let displayed = initial.map(mark => mark.digit)
  let disposed = false
  const timers = new Map<number, number>()
  const [order, setOrder] = createSignal(displayed)
  const [appearance, setAppearance] = createStore<Record<number, MarkAppearance>>(
    Object.fromEntries(DIGITS.map(digit => [digit, {
      className: initial.find(mark => mark.digit === digit)?.className ?? '',
      phase: undefined,
    }])),
  )

  function publishOrder() {
    const next = [...exiting, ...current.map(mark => mark.digit)]
    if (next.length === displayed.length && next.every((digit, index) => digit === displayed[index])) return
    displayed = next
    setOrder(next)
  }

  function cancelTimer(digit: number) {
    const timer = timers.get(digit)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.delete(digit)
  }

  function finishExit(digit: number) {
    if (disposed || !exiting.includes(digit)) return
    cancelTimer(digit)
    exiting = exiting.filter(value => value !== digit)
    publishOrder()
  }

  function update(next: Mark[]) {
    if (disposed) return
    const nextKeys = new Set(next.map(mark => mark.digit))
    const previousKeys = new Set(current.map(mark => mark.digit))
    const removed = current.filter(mark => !nextKeys.has(mark.digit))
    const nextExiting = [...exiting.filter(digit => !nextKeys.has(digit)), ...removed.map(mark => mark.digit)]
    const nextEntering = new Set(next.filter(mark => !previousKeys.has(mark.digit)).map(mark => mark.digit))
    const changed = entering.size > 0 || next.length !== current.length || next.some((mark, index) =>
      mark.digit !== current[index]?.digit || mark.className !== current[index]?.className)

    if (changed) {
      setAppearance(draft => {
        for (const { digit, className } of next) {
          const phase = nextEntering.has(digit) ? 'enter' : undefined
          if (draft[digit].className !== className) draft[digit].className = className
          if (draft[digit].phase !== phase) draft[digit].phase = phase
        }
        // An exiting mark keeps its last class, including its highlight and color.
        for (const { digit } of removed) draft[digit].phase = 'exit'
      })
    }

    current = next
    entering = nextEntering
    exiting = nextExiting
    for (const digit of timers.keys()) if (!exiting.includes(digit)) cancelTimer(digit)

    if (exiting.length && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const digit of timers.keys()) cancelTimer(digit)
      exiting = []
    } else {
      for (const digit of exiting) {
        if (timers.has(digit)) continue
        const timer = window.setTimeout(() => {
          if (timers.get(digit) === timer) finishExit(digit)
        }, EXIT_CLEANUP_FALLBACK_MS)
        timers.set(digit, timer)
      }
    }
    publishOrder()
  }

  function transitionEnd(digit: number, event: TransitionEvent) {
    if (event.target !== event.currentTarget || event.pseudoElement || event.propertyName !== 'opacity') return
    finishExit(digit)
  }

  function dispose() {
    disposed = true
    for (const digit of timers.keys()) cancelTimer(digit)
  }

  onCleanup(dispose)
  return { order, appearance, update, transitionEnd }
}

type CellController = { update(input: CellInput): void }

function Cell(props: { initial: CellInput; register(controller: CellController): void }) {
  let previous = props.initial
  const initialDescription = describeCell(previous)
  const [appearance, setAppearance] = createStore({
    className: initialDescription.className,
    label: initialDescription.label,
    selected: previous.selected,
    active: previous.active,
  })
  const candidateItems = (input: CellInput, digits: number[]) => input.value ? []
    : digits.map(digit => ({ digit, className: candidateClass(input, digit) }))
  const valueItems = (input: CellInput) => input.value ? [{ digit: input.value, className: 'cell-value' }] : []
  const candidates = createMarks(candidateItems(previous, initialDescription.digits))
  const values = createMarks(valueItems(previous))
  const index = previous.index
  const row = Math.floor(index / 9)
  const column = index % 9

  props.register({
    update(input) {
      if (CELL_FIELDS.every(field => previous[field] === input[field])) return
      const description = describeCell(input)
      setAppearance(draft => {
        if (draft.className !== description.className) draft.className = description.className
        if (draft.label !== description.label) draft.label = description.label
        if (draft.selected !== input.selected) draft.selected = input.selected
        if (draft.active !== input.active) draft.active = input.active
      })
      candidates.update(candidateItems(input, description.digits))
      values.update(valueItems(input))
      previous = input
    },
  })

  return (
    <button type="button" role="gridcell" data-cell={index} class={appearance.className}
      aria-label={appearance.label} aria-selected={appearance.selected ? 'true' : 'false'} tabindex={appearance.active ? 0 : -1}
      data-box-edge={(column + 1) % 3 === 0 ? 'true' : undefined}
      data-alternate-box={(Math.floor(row / 3) + Math.floor(column / 3)) % 2 === 1 ? 'true' : undefined}
      onClick={noopCell}>
      <Show when={candidates.order().length > 0}>
        <span class="candidate-marks" aria-hidden="true">
          <For each={candidates.order()}>{digit => (
            <span class={candidates.appearance[digit].className} style={{ 'grid-area': candidateGridArea(digit) }}
              data-board-fade={candidates.appearance[digit].phase}
              aria-hidden={candidates.appearance[digit].phase === 'exit' ? 'true' : undefined}
              inert={candidates.appearance[digit].phase === 'exit' || undefined}
              onTransitionEnd={event => candidates.transitionEnd(digit, event)}>{digit}</span>
          )}</For>
        </span>
      </Show>
      <For each={values.order()}>{digit => (
        <span class="cell-value" aria-hidden="true" data-board-fade={values.appearance[digit].phase}
          inert={values.appearance[digit].phase === 'exit' || undefined}
          onTransitionEnd={event => values.transitionEnd(digit, event)}>{digit}</span>
      )}</For>
    </button>
  )
}

/** Isolated classic-board prototype. The shared host owns all input and game state. */
export function mountSolid(container: HTMLElement, initial: BoardState): BoardAdapter {
  const initialCells = cellInputs(initial)
  const controllers: CellController[] = []
  let disposed = false
  let pending: BoardState | undefined
  let queued = false
  const unmount = render(() => (
    <div class="board-frame">
      <div class="col-labels" aria-hidden="true">{DIGITS.map(digit => <span>{digit}</span>)}</div>
      <div class="row-labels" aria-hidden="true">{DIGITS.map(digit => <span>{digit}</span>)}</div>
      <div class="board-body">
        <div class="sudoku-grid drag-select" role="grid" aria-label="Sudoku grid">
          {DIGITS.map(row => (
            <div class="grid-row" role="row" data-box-edge={row % 3 === 0 ? 'true' : undefined}>
              {DIGITS.map(column => {
                const index = (row - 1) * 9 + column - 1
                return <Cell initial={initialCells[index]} register={controller => { controllers[index] = controller }} />
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  ), container)

  return {
    update(state) {
      if (disposed) return
      pending = state
      if (queued) return
      queued = true
      // Match one atomic host update: marks must not animate states that never reached the DOM.
      queueMicrotask(() => {
        queued = false
        const next = pending
        pending = undefined
        if (disposed || !next) return
        cellInputs(next).forEach((input, index) => controllers[index].update(input))
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      pending = undefined
      unmount()
    },
  }
}
