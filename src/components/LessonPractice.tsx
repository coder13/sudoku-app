import { useRef, useState, type KeyboardEvent } from 'react'
import type { DeductionAction, LessonPractice } from '../sudoku/engine'
import { DIGITS, hasCandidate, peer } from '../sudoku/game'
import { cellName, lessonValues } from '../sudoku/lesson-diagram'
import { Board } from './Board'
import type { BoardAnnotations } from './BoardAnnotations'

type Operation = 'place' | 'eliminate'
function actionText(action: DeductionAction) {
  return 'place' in action
    ? `Place ${action.place.digit} in ${cellName(action.place.cell)}.`
    : `Remove ${action.eliminate.digit} from ${cellName(action.eliminate.cell)}.`
}

function sameAction(a: DeductionAction, b: DeductionAction) {
  if ('place' in a) return 'place' in b && a.place.cell === b.place.cell && a.place.digit === b.place.digit
  return 'eliminate' in b && a.eliminate.cell === b.eliminate.cell && a.eliminate.digit === b.eliminate.digit
}

function retryGuidance(attempt: DeductionAction, answers: LessonPractice['answers'], technique: string) {
  const placing = 'place' in attempt
  const { cell } = placing ? attempt.place : attempt.eliminate
  const address = cellName(cell)
  const movesHere = answers.filter((answer) => ('place' in answer ? answer.place : answer.eliminate).cell === cell)
  if (!movesHere.length) {
    return `There’s no ${technique} move in ${address}. Keep looking in the rest of the grid.`
  }
  if (!movesHere.some((answer) => ('place' in answer) === placing)) {
    return placing
      ? `In ${address}, look for a candidate to remove with ${technique}.`
      : `In ${address}, look for a digit to place with ${technique}.`
  }
  return placing
    ? `Look for a different digit to place in ${address} with ${technique}.`
    : `Look for a different candidate to remove from ${address} with ${technique}.`
}

export function PracticePuzzle({ puzzle, technique, instruction }: { puzzle: LessonPractice; technique: string; instruction?: string }) {
  const initial = lessonValues(puzzle)
  const firstEmpty = initial.indexOf('0')
  const canPlace = puzzle.answers.some((answer) => 'place' in answer)
  const canRemove = puzzle.answers.some((answer) => 'eliminate' in answer)
  const defaultInstruction = canPlace && canRemove ? 'Find one placement or candidate removal.'
    : canPlace ? 'Find one digit you can place.' : 'Find one candidate you can remove.'
  const defaultOperation: Operation = canPlace ? 'place' : 'eliminate'
  const [active, setActive] = useState(firstEmpty)
  const [operation, setOperation] = useState(defaultOperation)
  const [selected, setSelected] = useState<number | null>(null)
  const [digit, setDigit] = useState<number | null>(null)
  const [result, setResult] = useState<{ action: DeductionAction; revealed: boolean } | null>(null)
  const [guidance, setGuidance] = useState<string>()
  const board = useRef<HTMLDivElement>(null)
  const mask = selected === null ? 0 : puzzle.candidates[selected]
  const attempt = selected !== null && digit !== null
    ? operation === 'place' ? { place: { cell: selected, digit } } : { eliminate: { cell: selected, digit } }
    : null
  let values = initial
  let candidates = puzzle.candidates
  let annotations: BoardAnnotations | undefined

  if (result) {
    const placement = 'place' in result.action
    const { cell, digit } = 'place' in result.action ? result.action.place : result.action.eliminate
    const bit = 1 << (digit - 1)
    if (placement) values = `${initial.slice(0, cell)}${digit}${initial.slice(cell + 1)}`
    candidates = candidates.map((mask, index) => {
      if (placement && index === cell) return 0
      return index === cell || (placement && peer(index, cell)) ? mask & ~bit : mask
    })
    annotations = { cells: new Map([[cell, { outline: 'var(--lesson-result)', label: actionText(result.action) }]]) }
  } else if (attempt && selected !== null && digit !== null) {
    annotations = {
      candidates: new Map([[selected, new Map([[digit, {
        color: 'var(--lesson-accent)', mark: operation === 'place' ? 'ring' : 'strike', label: 'proposed move',
      }]])]]),
    }
  }

  function select(cell: number) {
    setActive(cell)
    if (result) return
    setSelected(initial[cell] === '0' ? cell : null)
    setDigit(null)
    setGuidance(undefined)
  }

  function choose(next: number) {
    if (result || !hasCandidate(mask, next)) return
    setDigit(digit === next ? null : next)
    setGuidance(undefined)
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const { key } = event
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const row = Math.floor(active / 9)
    const column = active % 9
    const offsets = { ArrowLeft: column ? -1 : 0, ArrowRight: column < 8 ? 1 : 0, ArrowUp: row ? -9 : 0, ArrowDown: row < 8 ? 9 : 0 }
    if (Object.hasOwn(offsets, key)) {
      event.preventDefault()
      const next = active + offsets[key as keyof typeof offsets]
      select(next)
      board.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus({ preventScroll: true })
    } else if (/^[1-9]$/.test(key)) {
      event.preventDefault()
      if (selected === null && !result && hasCandidate(puzzle.candidates[active], Number(key))) {
        setSelected(active)
        setDigit(Number(key))
      } else choose(Number(key))
    }
  }

  function check() {
    if (!attempt || result) return
    if (puzzle.answers.some((answer) => sameAction(answer, attempt))) setResult({ action: attempt, revealed: false })
    else setGuidance(retryGuidance(attempt, puzzle.answers, technique))
  }

  function reset() {
    setActive(firstEmpty)
    setSelected(null)
    setDigit(null)
    setGuidance(undefined)
    setResult(null)
    setOperation(defaultOperation)
  }

  return (
    <div className="lesson-practice-layout">
      <div className="lesson-board" onKeyDown={keyDown}>
        <Board givens={puzzle.givens} values={values} candidates={candidates} annotations={annotations} showGuides
          label={`Practice grid for ${technique}`} selected={selected !== null && !result ? [selected] : []}
          active={active} boardRef={board} onCell={select} />
      </div>
      <div className="lesson-practice-controls">
        <p className="lesson-practice-instruction">{instruction ?? defaultInstruction}</p>
        {canPlace && canRemove && <div className="lesson-practice-modes" role="group" aria-label="Move type">
          <button type="button" className="button secondary" aria-pressed={operation === 'place'} disabled={Boolean(result)}
            onClick={() => { setOperation('place'); setGuidance(undefined) }}>Place digit</button>
          <button type="button" className="button secondary" aria-pressed={operation === 'eliminate'} disabled={Boolean(result)}
            onClick={() => { setOperation('eliminate'); setGuidance(undefined) }}>Remove candidate</button>
        </div>}
        <div className="lesson-keypad" role="group" aria-label="Choose a digit">
          {DIGITS.map((candidateDigit) => <button type="button" key={candidateDigit} className="button secondary"
            aria-pressed={digit === candidateDigit && !result} disabled={Boolean(result) || !hasCandidate(mask, candidateDigit)}
            onClick={() => choose(candidateDigit)}>{candidateDigit}</button>)}
        </div>
        <p className="lesson-practice-feedback" role="status" data-result={result ? 'correct' : undefined}>
          {result ? `${result.revealed ? 'One possible move.' : 'Correct.'} ${actionText(result.action)}`
            : guidance ?? (attempt ? actionText(attempt) : selected === null ? 'Choose an empty cell to start.' : `Choose a digit for ${cellName(selected)}.`)}
        </p>
        <div className="lesson-practice-actions">
          <button type="button" className={`button ${result ? 'secondary' : 'primary'}`} disabled={!result && !attempt}
            onClick={result ? reset : check}>{result ? 'Reset puzzle' : 'Check move'}</button>
          {!result && <button type="button" className="button quiet"
            onClick={() => setResult({ action: puzzle.suggestion, revealed: true })}>Show one move</button>}
        </div>
      </div>
    </div>
  )
}
