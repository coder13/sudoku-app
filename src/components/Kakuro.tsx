import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight, Delete, Lightbulb, Pencil, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { kakuroCatalog, kakuroDifficulties, kakuroDifficultyLabels, type KakuroEntry } from '../kakuro/catalog'
import { checkKakuro, findKakuroHint, type KakuroHint } from '../kakuro/engine'
import { emptyKakuroPosition, loadKakuroPosition, saveKakuroPosition, type KakuroPosition } from '../kakuro/progress'
import { Button, IconButton, buttonClassName, iconButtonClassName } from './Button'
import './puzzle-games.css'
import './kakuro.css'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const rules = 'Fill each white cell with a digit from 1 to 9. Use each digit only once per run. The digits must add up to the clue.'

function KakuroHeading({ title, inPlay, children }: { title: string; inPlay?: boolean; children?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const state = useLocation({ select: location => location.state })
  const fromParent = inPlay ? state.fromKakuroDifficulty : state.fromPuzzleGameTypes
  const label = inPlay ? 'Back to Kakuro difficulty' : 'Back to game types'

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [title])

  return <header className="puzzles-page-heading kakuro-heading">
    {fromParent && canGoBack
      ? <IconButton aria-label={label} onClick={() => router.history.back()}><ChevronLeft size={21} aria-hidden="true" /></IconButton>
      : <Link to={inPlay ? '/puzzles/kakuro' : '/puzzles/games'} className={iconButtonClassName()} aria-label={label}>
        <ChevronLeft size={21} aria-hidden="true" />
      </Link>}
    <div><h1 ref={heading} tabIndex={-1}>{title}</h1>{children}</div>
  </header>
}

export function KakuroDifficultyPage() {
  const [started, setStarted] = useState<ReadonlySet<string>>(new Set())
  const [solved, setSolved] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const active = new Set<string>()
    const complete = new Set<string>()
    for (const entry of kakuroCatalog) {
      const position = loadKakuroPosition(entry)
      if (!position || !position.values.some(Boolean) && !position.notes.some(Boolean)) continue
      if (checkKakuro(entry.puzzle, position.values).complete) complete.add(entry.id)
      else active.add(entry.id)
    }
    setStarted(active)
    setSolved(complete)
  }, [])

  return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout">
      <KakuroHeading title="Choose Kakuro difficulty" />
      <p className="kakuro-rules">{rules}</p>
      <ul className="game-list main-puzzle-list motion-screen">
        {kakuroDifficulties.map(difficulty => {
          const group = kakuroCatalog.filter(entry => entry.difficulty === difficulty)
          const next = group.find(entry => !started.has(entry.id) && !solved.has(entry.id))
            ?? group.find(entry => started.has(entry.id)) ?? group[0]
          return <li key={difficulty}><Link className="game-row" to="/puzzles/kakuro/$puzzle"
            params={{ puzzle: next.id }} state={{ fromKakuroDifficulty: true }}>
            <span className="game-row-copy"><strong>{kakuroDifficultyLabels[difficulty]}</strong>
              <small>{group.filter(entry => solved.has(entry.id)).length} of {group.length} solved</small></span>
            <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
          </Link></li>
        })}
      </ul>
      {started.size > 0 && <section className="kakuro-resume" aria-labelledby="kakuro-resume-title">
        <h2 id="kakuro-resume-title">In progress</h2>
        <ul className="game-list main-puzzle-list">
          {kakuroCatalog.filter(entry => started.has(entry.id)).map(entry =>
            <li key={entry.id}><Link className="game-row" to="/puzzles/kakuro/$puzzle"
              params={{ puzzle: entry.id }} state={{ fromKakuroDifficulty: true }}>
              <span className="game-row-copy"><strong>{kakuroDifficultyLabels[entry.difficulty]} {entry.number}</strong></span>
              <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
            </Link></li>)}
        </ul>
      </section>}
    </div>
  </main>
}

export function KakuroPlay({ entry }: { entry: KakuroEntry }) {
  return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout kakuro-layout">
      <KakuroHeading title="Kakuro" inPlay>
        <small>{kakuroDifficultyLabels[entry.difficulty]} {entry.number}</small>
      </KakuroHeading>
      <KakuroBoard entry={entry} />
    </div>
  </main>
}

function KakuroBoard({ entry }: { entry: KakuroEntry }) {
  const { puzzle } = entry
  const [position, setPosition] = useState(() => emptyKakuroPosition(entry))
  const [ready, setReady] = useState(false)
  const [selection, setSelection] = useState(() => puzzle.cells.indexOf(null))
  const [notes, setNotes] = useState(false)
  const [history, setHistory] = useState<KakuroPosition[]>([])
  const [future, setFuture] = useState<KakuroPosition[]>([])
  const [showCheck, setShowCheck] = useState(false)
  const [hint, setHint] = useState<KakuroHint | null>(null)
  const [status, setStatus] = useState('')
  const [storageError, setStorageError] = useState(false)
  const cellButtons = useRef(new Map<number, HTMLButtonElement>())
  const result = useMemo(() => checkKakuro(puzzle, position.values), [puzzle, position.values])
  const conflictClues = showCheck ? new Set(result.conflicts.map(run => run.clue)) : new Set<number>()
  const conflictCells = showCheck ? new Set(result.conflicts.flatMap(run => run.cells.filter(index => position.values[index]))) : new Set<number>()
  const hintClues = new Set(hint?.runs.map(run => run.clue))
  const locked = !ready || result.complete

  useEffect(() => {
    const stored = loadKakuroPosition(entry)
    if (stored) setPosition(stored)
    setReady(true)
  }, [entry])

  function update(next: KakuroPosition) {
    setPosition(next)
    setStorageError(!saveKakuroPosition(entry, next))
    setShowCheck(false)
    setHint(null)
    setStatus('')
  }

  function enter(digit: number, cell = selection, pencil = notes) {
    if (locked || puzzle.cells[cell] !== null) return
    const next = { values: [...position.values], notes: [...position.notes] }
    if (digit && pencil) {
      if (next.values[cell]) return
      next.notes[cell] ^= 1 << (digit - 1)
    } else {
      if (next.values[cell] === digit && !next.notes[cell]) return
      next.values[cell] = digit
      next.notes[cell] = 0
    }
    setHistory([...history, position])
    setFuture([])
    update(next)
  }

  function undo() {
    const previous = history.at(-1)
    if (!previous) return
    setHistory(history.slice(0, -1))
    setFuture([...future, position])
    update(previous)
  }

  function redo() {
    const next = future.at(-1)
    if (!next) return
    setHistory([...history, position])
    setFuture(future.slice(0, -1))
    update(next)
  }

  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const direction = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key]
    if (direction) {
      event.preventDefault()
      const [dr, dc] = direction
      let row = Math.floor(selection / puzzle.width) + dr
      let col = selection % puzzle.width + dc
      while (row >= 0 && row < puzzle.height && col >= 0 && col < puzzle.width) {
        const cell = row * puzzle.width + col
        if (puzzle.cells[cell] === null) {
          setSelection(cell)
          cellButtons.current.get(cell)?.focus()
          return
        }
        row += dr
        col += dc
      }
    } else if (/^[1-9]$/.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      enter(Number(event.key) || 0)
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault()
      setNotes(current => !current)
    }
  }

  function requestHint() {
    const next = findKakuroHint(puzzle, position.values)
    setHint(next)
    setShowCheck(!next && result.conflicts.length > 0)
    setStatus(next ? '' : result.conflicts.length ? 'Resolve the highlighted clues first.' : 'No logical placement found for these entries.')
  }

  function cellName(index: number) {
    return `R${Math.floor(index / puzzle.width) + 1}C${index % puzzle.width + 1}`
  }

  function nextPuzzle() {
    return kakuroCatalog.find(candidate => candidate.difficulty === entry.difficulty && candidate.id !== entry.id &&
      !checkKakuro(candidate.puzzle, loadKakuroPosition(candidate)?.values ?? []).complete)
  }

  const next = ready && result.complete ? nextPuzzle() : undefined
  return <div className="kakuro-play motion-screen">
    <div className="kakuro-grid" role="group" aria-label="Kakuro board"
      style={{ '--kakuro-columns': puzzle.width } as CSSProperties} onKeyDown={onGridKey}>
      {puzzle.cells.map((cell, index) => {
        if (cell !== null) {
          const label = [cell.across && `${cell.across} across`, cell.down && `${cell.down} down`].filter(Boolean).join(', ')
          return <div key={index} className="kakuro-clue" data-clue={Boolean(label)} data-conflict={conflictClues.has(index)}
            data-hint={hintClues.has(index)} role={label ? 'img' : undefined}
            aria-label={label ? `${cellName(index)}: ${label}` : undefined} aria-hidden={label ? undefined : true}>
            <span className="kakuro-clue-across" aria-hidden="true">{cell.across}</span>
            <span className="kakuro-clue-down" aria-hidden="true">{cell.down}</span>
          </div>
        }

        const value = position.values[index]
        const marks = digits.filter(digit => position.notes[index] & (1 << (digit - 1)))
        const clues = puzzle.runs.filter(run => run.cells.includes(index)).map(run => `${run.total} ${run.direction}`)
        const description = value ? String(value) : marks.length ? `notes ${marks.join(', ')}` : 'empty'
        return <button key={index} type="button" className="kakuro-cell"
          ref={button => { if (button) cellButtons.current.set(index, button); else cellButtons.current.delete(index) }}
          tabIndex={selection === index ? 0 : -1} aria-pressed={selection === index}
          data-conflict={conflictCells.has(index)} data-hint={hint?.cell === index}
          aria-label={`${cellName(index)}, ${description}, ${clues.join(', ')}`}
          onFocus={() => setSelection(index)} onClick={() => setSelection(index)}>
          {value || <span className="kakuro-notes" aria-hidden="true">{digits.map(digit =>
            <span key={digit}>{marks.includes(digit) ? digit : ''}</span>)}</span>}
        </button>
      })}
    </div>
    <section className="surface kakuro-controls" aria-label="Kakuro controls">
      <div className="kakuro-keypad" role="group" aria-label="Digits">
        {digits.map(digit => <Button key={digit} disabled={locked} onClick={() => enter(digit)}>{digit}</Button>)}
      </div>
      <div className="kakuro-actions">
        <Button aria-pressed={notes} disabled={locked} onClick={() => setNotes(current => !current)}>
          <Pencil size={16} aria-hidden="true" />Notes
        </Button>
        <IconButton aria-label="Erase cell" disabled={locked} onClick={() => enter(0)}><Delete size={17} aria-hidden="true" /></IconButton>
        <IconButton aria-label="Undo" disabled={!history.length} onClick={undo}><Undo2 size={17} aria-hidden="true" /></IconButton>
        <IconButton aria-label="Redo" disabled={!future.length} onClick={redo}><Redo2 size={17} aria-hidden="true" /></IconButton>
      </div>
      <div className="kakuro-actions">
        <Button disabled={locked} onClick={() => {
          setHint(null)
          setShowCheck(true)
          setStatus(result.conflicts.length ? 'The highlighted clues cannot fit these entries.' : 'Each clue fits the current entries.')
        }}><Check size={17} aria-hidden="true" />Check</Button>
        <Button disabled={locked} onClick={requestHint}><Lightbulb size={17} aria-hidden="true" />Hint</Button>
      </div>
      <div className="kakuro-status" role="status" aria-live="polite">
        {result.complete ? 'Puzzle solved.' : hint
          ? `The highlighted clues leave only ${hint.digit} for ${cellName(hint.cell)}.` : status}
      </div>
      {hint && <div className="kakuro-hint">
        <details className="kakuro-help">
          <summary>Clues used</summary>
          <ul>{hint.runs.map(run => <li key={`${run.clue}-${run.direction}`}>
            {run.total} {run.direction} at {cellName(run.clue)}
          </li>)}</ul>
        </details>
        <Button onClick={() => enter(hint.digit, hint.cell, false)}>Place {hint.digit}</Button>
      </div>}
      {result.complete && (next
        ? <Link className={buttonClassName('primary')} to="/puzzles/kakuro/$puzzle" params={{ puzzle: next.id }} replace>Next puzzle</Link>
        : <Link className={buttonClassName('primary')} to="/puzzles/kakuro">Choose difficulty</Link>)}
      {storageError && <p className="form-error" role="alert">This browser cannot save your progress.</p>}
      <details className="kakuro-help"><summary>How to play</summary><p>{rules}</p></details>
    </section>
  </div>
}
