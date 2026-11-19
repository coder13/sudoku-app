import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight, Delete, Lightbulb, Pencil, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { numberPuzzleDifficulties, numberPuzzleDifficultyLabels, type NumberPuzzleEntry } from '../number-puzzles/catalog'
import { emptyNumberPosition, loadNumberPosition, saveNumberPosition, type NumberPosition } from '../number-puzzles/progress'
import { Button, IconButton, buttonClassName, iconButtonClassName } from './Button'
import './puzzle-games.css'
import './number-puzzle.css'

export type NumberGame = 'kakuro' | 'calcudoku' | 'futoshiki'

type BoardCell = {
  label?: string
  given?: number
  decoration?: ReactNode
  edges?: string
  block?: boolean
}

type Hint = { cell: number; value: number; marked: number[]; reasons: string[] }

export type NumberBoard = {
  width: number
  height: number
  maxValue: number
  cells: readonly BoardCell[]
  check: (values: readonly number[]) => { complete: boolean; marked: number[] }
  hint: (values: readonly number[]) => Hint | null
}

export type NumberGameConfig<Entry extends NumberPuzzleEntry> = {
  game: NumberGame
  name: string
  rules: string
  entries: readonly Entry[]
  board: (entry: Entry) => NumberBoard
  hasClueCells?: boolean
}

function boardPosition(game: NumberGame, id: string, board: NumberBoard) {
  const key = `${game}.position.v1.${id}`
  const editable = board.cells.map(cell => !cell.block && !cell.given)
  return { editable, key, load: () => loadNumberPosition(key, editable, board.maxValue) }
}

function NumberGameHeading({ game, title, inPlay, children }: {
  game: NumberGame; title: string; inPlay?: boolean; children?: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const state = useLocation({ select: location => location.state })
  const fromParent = inPlay ? state.fromNumberDifficulty === game || game === 'kakuro' && state.fromKakuroDifficulty
    : state.fromPuzzleGameTypes

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [title])

  return <header className="puzzles-page-heading number-puzzle-heading">
    <Link to={inPlay ? `/puzzles/${game}` : '/puzzles/games'} className={iconButtonClassName()}
      aria-label={inPlay ? `Back to ${title} difficulty` : 'Back to game types'}
      onClick={event => {
        if (fromParent && canGoBack && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          event.preventDefault()
          router.history.back()
        }
      }}>
      <ChevronLeft size={21} aria-hidden="true" />
    </Link>
    <div><h1 ref={heading} tabIndex={-1}>{title}</h1>{children}</div>
  </header>
}

/** Use for the difficulty and resume page of a standalone number puzzle. */
export function NumberGameDifficulty<Entry extends NumberPuzzleEntry>({ config }: { config: NumberGameConfig<Entry> }) {
  const { entries, game, name, rules } = config
  const [started, setStarted] = useState<ReadonlySet<string>>(new Set())
  const [solved, setSolved] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const active = new Set<string>()
    const complete = new Set<string>()
    for (const entry of entries) {
      const board = config.board(entry)
      const position = boardPosition(game, entry.id, board).load()
      if (!position || !position.values.some(Boolean) && !position.notes.some(Boolean)) continue
      if (board.check(position.values).complete) complete.add(entry.id)
      else active.add(entry.id)
    }
    setStarted(active)
    setSolved(complete)
  }, [config, entries, game])

  return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout">
      <NumberGameHeading game={game} title={`Choose ${name} difficulty`} />
      <p className="number-puzzle-rules">{rules}</p>
      <ul className="game-list main-puzzle-list motion-screen">
        {numberPuzzleDifficulties.map(difficulty => {
          const group = entries.filter(entry => entry.difficulty === difficulty)
          if (!group.length) return null
          const next = group.find(entry => !started.has(entry.id) && !solved.has(entry.id))
            ?? group.find(entry => started.has(entry.id)) ?? group[0]
          return <li key={difficulty}><Link className="game-row" to={`/puzzles/${game}/$puzzle`}
            params={{ puzzle: next.id }} state={{ fromNumberDifficulty: game }}>
            <span className="game-row-copy"><strong>{numberPuzzleDifficultyLabels[difficulty]}</strong>
              <small>{group.filter(entry => solved.has(entry.id)).length} of {group.length} solved</small></span>
            <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
          </Link></li>
        })}
      </ul>
      {started.size > 0 && <section className="number-puzzle-resume" aria-labelledby="number-puzzle-resume-title">
        <h2 id="number-puzzle-resume-title">In progress</h2>
        <ul className="game-list main-puzzle-list">
          {entries.filter(entry => started.has(entry.id)).map(entry =>
            <li key={entry.id}><Link className="game-row" to={`/puzzles/${game}/$puzzle`}
              params={{ puzzle: entry.id }} state={{ fromNumberDifficulty: game }}>
              <span className="game-row-copy"><strong>{numberPuzzleDifficultyLabels[entry.difficulty]} {entry.number}</strong></span>
              <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
            </Link></li>)}
        </ul>
      </section>}
    </div>
  </main>
}

/** Use for standalone play with a game-specific board, check, and hint function. */
export function NumberGamePlay<Entry extends NumberPuzzleEntry>({ config, entry }: {
  config: NumberGameConfig<Entry>; entry: Entry
}) {
  return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout number-puzzle-layout">
      <NumberGameHeading game={config.game} title={config.name} inPlay>
        <small>{numberPuzzleDifficultyLabels[entry.difficulty]} {entry.number}</small>
      </NumberGameHeading>
      <NumberPuzzleBoard config={config} entry={entry} key={entry.id} />
    </div>
  </main>
}

function NumberPuzzleBoard<Entry extends NumberPuzzleEntry>({ config, entry }: { config: NumberGameConfig<Entry>; entry: Entry }) {
  const { game, name, rules, hasClueCells } = config
  const board = useMemo(() => config.board(entry), [config, entry])
  const { editable, key, load } = useMemo(() => boardPosition(game, entry.id, board), [game, entry.id, board])
  const { width, height, maxValue } = board
  const digits = useMemo(() => Array.from({ length: maxValue }, (_, i) => i + 1), [maxValue])
  const [position, setPosition] = useState(() => emptyNumberPosition(board.cells.length))
  const [ready, setReady] = useState(false)
  const [selection, setSelection] = useState(() => editable.indexOf(true))
  const [notes, setNotes] = useState(false)
  const [history, setHistory] = useState<NumberPosition[]>([])
  const [future, setFuture] = useState<NumberPosition[]>([])
  const [showCheck, setShowCheck] = useState(false)
  const [hint, setHint] = useState<Hint | null>(null)
  const [status, setStatus] = useState('')
  const [storageError, setStorageError] = useState(false)
  const cellButtons = useRef(new Map<number, HTMLButtonElement>())
  const result = useMemo(() => board.check(position.values), [board, position.values])
  const conflictCells = new Set(showCheck ? result.marked : [])
  const hintCells = new Set(hint?.marked)
  const locked = !ready || result.complete

  useEffect(() => {
    const stored = load()
    if (stored) setPosition(stored)
    setReady(true)
  }, [load])

  function update(next: NumberPosition) {
    setPosition(next)
    setStorageError(!saveNumberPosition(key, next))
    setShowCheck(false)
    setHint(null)
    setStatus('')
  }

  function enter(value: number, cell = selection, pencil = notes) {
    if (locked || !editable[cell] || value > maxValue) return
    const next = { values: [...position.values], notes: [...position.notes] }
    if (value && pencil) {
      if (next.values[cell]) return
      next.notes[cell] ^= 1 << (value - 1)
    } else {
      if (next.values[cell] === value && !next.notes[cell]) return
      next.values[cell] = value
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
      let row = Math.floor(selection / width) + dr
      let col = selection % width + dc
      while (row >= 0 && row < height && col >= 0 && col < width) {
        const cell = row * width + col
        if (!board.cells[cell].block) {
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
    const next = board.hint(position.values)
    setHint(next)
    setShowCheck(!next && result.marked.length > 0)
    setStatus(next ? '' : result.marked.length
      ? hasClueCells ? 'Resolve the highlighted clues first.' : 'Resolve the highlighted entries first.'
      : 'No logical placement found for these entries.')
  }

  function cellName(index: number) {
    return `R${Math.floor(index / width) + 1}C${index % width + 1}`
  }

  function nextPuzzle() {
    return config.entries.find(candidate => {
      if (candidate.difficulty !== entry.difficulty || candidate.id === entry.id) return false
      const candidateBoard = config.board(candidate)
      return !candidateBoard.check(boardPosition(game, candidate.id, candidateBoard).load()?.values ?? []).complete
    })
  }

  const next = ready && result.complete ? nextPuzzle() : undefined
  return <div className="number-puzzle-play motion-screen">
    <div className="number-puzzle-grid" role="group" aria-label={`${name} board`}
      style={{ '--number-puzzle-columns': width } as CSSProperties} onKeyDown={onGridKey}>
      {board.cells.map(({ label, block, decoration, edges, given }, index) => {
        if (block) {
          return <div key={index} className="number-puzzle-block" data-clue={Boolean(label)}
            data-conflict={conflictCells.has(index)} data-hint={hintCells.has(index)} role={label ? 'img' : undefined}
            aria-label={label ? `${cellName(index)}: ${label}` : undefined} aria-hidden={label ? undefined : true}>
            {decoration}
          </div>
        }

        const value = given || position.values[index]
        const marks = digits.filter(digit => position.notes[index] & (1 << (digit - 1)))
        const description = given ? `given ${given}` : value ? String(value) : marks.length ? `notes ${marks.join(', ')}` : 'empty'
        return <button key={index} type="button" className="number-puzzle-cell"
          ref={button => { if (button) cellButtons.current.set(index, button); else cellButtons.current.delete(index) }}
          tabIndex={selection === index ? 0 : -1} aria-pressed={selection === index}
          data-conflict={conflictCells.has(index)} data-hint={hint?.cell === index} data-context={hintCells.has(index)}
          data-edges={edges} data-given={Boolean(given)} data-decorated={Boolean(decoration)}
          aria-label={`${cellName(index)}, ${description}${label ? ', ' + label : ''}`}
          onFocus={() => setSelection(index)} onClick={() => setSelection(index)}>
          {decoration}
          {value || <span className="number-puzzle-notes" aria-hidden="true">{digits.map(digit =>
            <span key={digit}>{marks.includes(digit) ? digit : ''}</span>)}</span>}
        </button>
      })}
    </div>
    <section className="surface number-puzzle-controls" aria-label={`${name} controls`}>
      <div className="number-puzzle-keypad" role="group" aria-label="Digits">
        {digits.map(digit => <Button key={digit} disabled={locked || !editable[selection]} onClick={() => enter(digit)}>{digit}</Button>)}
      </div>
      <div className="number-puzzle-actions">
        <Button aria-pressed={notes} disabled={locked} onClick={() => setNotes(current => !current)}>
          <Pencil size={16} aria-hidden="true" />Notes
        </Button>
        <IconButton aria-label="Erase cell" disabled={locked || !editable[selection]} onClick={() => enter(0)}><Delete size={17} aria-hidden="true" /></IconButton>
        <IconButton aria-label="Undo" disabled={!history.length} onClick={undo}><Undo2 size={17} aria-hidden="true" /></IconButton>
        <IconButton aria-label="Redo" disabled={!future.length} onClick={redo}><Redo2 size={17} aria-hidden="true" /></IconButton>
      </div>
      <div className="number-puzzle-actions">
        <Button disabled={locked} onClick={() => {
          setHint(null)
          setShowCheck(true)
          setStatus(hasClueCells
            ? result.marked.length ? 'The highlighted clues cannot fit these entries.' : 'Each clue fits the current entries.'
            : result.marked.length ? 'The highlighted entries conflict with the rules.' : 'The entries fit the rules checked so far.')
        }}><Check size={17} aria-hidden="true" />Check</Button>
        <Button disabled={locked} onClick={requestHint}><Lightbulb size={17} aria-hidden="true" />Hint</Button>
      </div>
      <div className="number-puzzle-status" role="status" aria-live="polite">
        {result.complete ? 'Puzzle solved.' : hint
          ? `The ${hasClueCells ? 'highlighted clues' : 'listed rules'} leave only ${hint.value} for ${cellName(hint.cell)}.` : status}
      </div>
      {hint && <div className="number-puzzle-hint">
        <details className="number-puzzle-help">
          <summary>{hasClueCells ? 'Clues used' : 'Rules used'}</summary>
          <ul>{hint.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
        </details>
        <Button onClick={() => enter(hint.value, hint.cell, false)}>Place {hint.value}</Button>
      </div>}
      {result.complete && (next
        ? <Link className={buttonClassName('primary')} to={`/puzzles/${game}/$puzzle`}
          params={{ puzzle: next.id }} state={{ fromNumberDifficulty: game }} replace>Next puzzle</Link>
        : <Link className={buttonClassName('primary')} to={`/puzzles/${game}`}>Choose difficulty</Link>)}
      {storageError && <p className="form-error" role="alert">This browser cannot save your progress.</p>}
      <details className="number-puzzle-help"><summary>How to play</summary><p>{rules}</p></details>
    </section>
  </div>
}
