import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import { Calculator, Check, ChevronLeft, ChevronRight, Hash, MoveHorizontal, Route as PathIcon, Delete, Info, Lightbulb, ListFilter, ListOrdered, Pencil, Redo2, Sigma, Undo2 } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { numberPuzzleDifficulties, numberPuzzleDifficultyLabels, type NumberPuzzleDifficulty, type NumberPuzzleEntry } from '../number-puzzles/catalog'
import type { DifficultyStatistics } from '../sudoku/difficulty-statistics'
import type { GeneratedNumberGame } from '../number-puzzles/generated'
import {
  generatedNumberHistory, numberPositionKey, openGeneratedNumberPuzzle, saveGeneratedNumberProgress,
} from '../number-puzzles/generated-storage'
import {
  emptyNumberPosition, loadNumberDifficulty, loadNumberProgress, NUMBER_HISTORY_SIZE,
  parseNumberProgress, readNumberProgress, rememberNumberDifficulty, saveNumberProgress,
  type NumberMove, type NumberProgress, type SavedNumberProgress,
} from '../number-puzzles/progress'
import { Button, IconButton, buttonClassName, iconButtonClassName } from './Button'
import { DifficultyOptions, PuzzleDifficultyStep } from './DifficultySelector'
import { PuzzlesSectionNav } from './PuzzlesSectionNav'
import { DeductionExplanation, HintCard } from './HintCard'
import { Modal } from './Modal'
import { PlayActionsButton, PlayHint, PlayLayout } from './PlayLayout'
import { PlacementAnalysis, PuzzleAnalysis } from './PuzzleAnalysis'
import { PuzzleCheckResult, type DialogResult } from './PuzzleCheckResult'
import { SolutionDialog, SolutionPath, solutionEndSummary, type NumberSolutionTrace } from './SolutionPath'
import { useMobileLayout } from './mobile-layout'
import { numberSolution } from '../number-puzzles/solution'
import { TECHNIQUE_FINDER_TITLE } from '../sudoku/puzzle-analysis'
import { shortcutLabel, shortcutMatches, shortcutStore } from '../sudoku/shortcuts'
import { PuzzleKeypad } from './PuzzleKeypad'
import { useNumberPuzzleGeneration } from './useNumberPuzzleGeneration'
import './puzzle-games.css'
import './number-puzzle.css'

export type NumberGame = GeneratedNumberGame | 'futoshiki' | 'hidato' | 'rullo'

type BoardCell = {
  label?: string
  given?: number
  printed?: number
  decoration?: ReactNode
  edges?: string
  block?: boolean
  endpoint?: boolean
}

type Hint = { cell: number; value: number; marked: number[]; technique: string } & (
  | { reasons: string[]; renderExplanation?: never }
  | { renderExplanation: (cellName: (index: number) => string) => ReactNode; reasons?: never }
)

export type NumberBoard = {
  width: number
  height: number
  maxValue: number
  cells: readonly BoardCell[]
  cellChoices?: { labels: readonly string[]; off: number }
  mirrorEdgeClues?: boolean
  check: (values: readonly number[], mode?: 'solution') => { complete: boolean; marked: number[] }
  hints: (values: readonly number[], limit?: number) => readonly Hint[]
  solve: () => readonly number[] | null
}

export type NumberGameConfig<Entry extends NumberPuzzleEntry> = {
  name: string
  rules: string
  entries: readonly Entry[]
  techniques: readonly string[]
  board: (entry: Entry) => NumberBoard
  hasClueCells?: boolean
} & (
  | { game: GeneratedNumberGame; generatedEntry?: (id: string, number: number) => Entry | null }
  | { game: Exclude<NumberGame, GeneratedNumberGame>; generatedEntry?: never }
)

function puzzleDestination(game: NumberGame, entry: NumberPuzzleEntry) {
  return {
    to: `/puzzles/${game}/$puzzle` as const,
    params: { puzzle: entry.generated ? 'generated' : entry.id },
    search: entry.generated ? { board: entry.id } : undefined,
  }
}

function boardPosition(game: NumberGame, id: string, board: NumberBoard) {
  const key = numberPositionKey(game, id)
  const editable = editableCells(board)
  return { editable, key, load: () => loadNumberProgress(key, editable, board.maxValue) }
}

function editableCells(board: NumberBoard) {
  return board.cells.map(cell => !cell.block && !cell.given)
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
    <Link to={inPlay ? `/puzzles/${game}` : '/puzzles/games'} className={iconButtonClassName('secondary', inPlay ? undefined : 'puzzles-back')}
      aria-label={inPlay ? `Back to ${title} difficulty` : 'Back to game types'}
      onClick={event => {
        if (fromParent && canGoBack && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          event.preventDefault()
          router.history.back()
        }
      }}>
      <ChevronLeft size={21} aria-hidden="true" />
    </Link>
    {inPlay ? <div><h1 ref={heading} tabIndex={-1}>{title}</h1>{children}</div>
      : <h1 id="puzzles-page-title" ref={heading} tabIndex={-1}>{title}</h1>}
  </header>
}

type ProgressStatus = 'started' | 'solved'
type GeneratedProgress = {
  active: NumberPuzzleEntry[]
  solved: Map<NumberPuzzleDifficulty, number>
}

function progressStatus(board: NumberBoard, saved: SavedNumberProgress): ProgressStatus | null {
  const progress = parseNumberProgress(saved, editableCells(board), board.maxValue)
  if (!progress) return null
  const { position, past, future } = progress
  if (!past.length && !future.length && !position.values.some(Boolean) && !position.notes.some(Boolean)) return null
  return board.check(position.values).complete ? 'solved' : 'started'
}

const resumeBatchSize = 24

function NumberResumeList({ game, entries }: { game: NumberGame; entries: readonly NumberPuzzleEntry[] }) {
  const [visible, setVisible] = useState(resumeBatchSize)
  const rows = useMemo(() => entries.map(entry => <li key={entry.id}>
    <Link className="game-row" {...puzzleDestination(game, entry)} state={{ fromNumberDifficulty: game }}>
      <span className="game-row-copy"><strong>{numberPuzzleDifficultyLabels[entry.difficulty]} {entry.number}</strong>
        {entry.generated && <small>Generated puzzle</small>}</span>
      <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
    </Link>
  </li>), [entries, game])

  useEffect(() => {
    if (visible >= rows.length) return
    // Add the next set of links after the browser can paint and handle input.
    const frame = window.requestAnimationFrame(() => setVisible(visible + resumeBatchSize))
    return () => window.cancelAnimationFrame(frame)
  }, [visible, rows.length])

  return <section className="number-puzzle-resume new-puzzle-step" aria-labelledby="number-puzzle-resume-title">
    <h2 id="number-puzzle-resume-title">In progress</h2>
    <ul className="game-list main-puzzle-list">{rows.slice(0, visible)}</ul>
  </section>
}

/** Use for the difficulty and resume page of a standalone number puzzle. */
export function NumberGameDifficulty<Entry extends NumberPuzzleEntry>({ config }: { config: NumberGameConfig<Entry> }) {
  const { entries, game, name, generatedEntry } = config
  const router = useRouter()
  const levels = numberPuzzleDifficulties.filter(level => entries.some(entry => entry.difficulty === level))
  const [difficulty, setDifficulty] = useState<NumberPuzzleDifficulty>(levels[0])
  const generation = useNumberPuzzleGeneration(generatedEntry ? game : null)
  const [catalogProgress, setCatalogProgress] = useState<ReadonlyMap<string, ProgressStatus> | null>(null)
  const [generatedProgress, setGeneratedProgress] = useState<GeneratedProgress | null>(null)

  useEffect(() => {
    const catalog = new Map<string, ProgressStatus>()
    for (const entry of entries) {
      const saved = readNumberProgress(numberPositionKey(game, entry.id))
      const status = saved && progressStatus(config.board(entry), saved)
      if (status) catalog.set(entry.id, status)
    }
    const savedDifficulty = loadNumberDifficulty(game)
    if (savedDifficulty && entries.some(entry => entry.difficulty === savedDifficulty)) setDifficulty(savedDifficulty)
    setCatalogProgress(catalog)

    const generated: GeneratedProgress = { active: [], solved: new Map() }
    if (!generatedEntry) {
      setGeneratedProgress(generated)
      return
    }

    setGeneratedProgress(null)
    let history: Awaited<ReturnType<typeof generatedNumberHistory>> = []
    let cursor = 0
    let active = true
    const queue = new MessageChannel()
    const closeQueue = () => {
      queue.port1.close()
      queue.port2.close()
    }
    const readBatch = () => {
      const deadline = performance.now() + 6
      do {
        const { id, number, progress } = history[cursor++]
        if (!progress) continue
        const entry = generatedEntry(id, number)
        if (!entry) continue
        const status = progressStatus(config.board(entry), progress)
        const { difficulty } = entry
        if (status === 'solved') generated.solved.set(difficulty, (generated.solved.get(difficulty) ?? 0) + 1)
        if (status === 'started') generated.active.push({ id, difficulty, number, generated: true })
      } while (cursor < history.length && performance.now() < deadline)

      if (cursor < history.length) queue.port2.postMessage(null)
      else {
        closeQueue()
        setGeneratedProgress(generated)
      }
    }
    // Allow the picker to paint before checking generated boards.
    queue.port1.onmessage = readBatch
    const frame = window.requestAnimationFrame(() => {
      void generatedNumberHistory(game).then(records => {
        if (!active) return
        history = records
        if (history.length) queue.port2.postMessage(null)
        else {
          closeQueue()
          setGeneratedProgress(generated)
        }
      })
    })
    return () => {
      active = false
      window.cancelAnimationFrame(frame)
      closeQueue()
    }
  }, [config, entries, game, generatedEntry])

  const ready = catalogProgress !== null
  const active = useMemo(() => [
    ...entries.filter(entry => catalogProgress?.get(entry.id) === 'started'),
    ...(generatedProgress?.active ?? []),
  ], [entries, catalogProgress, generatedProgress])
  const statistics = generatedProgress && new Map<NumberPuzzleDifficulty, DifficultyStatistics>(levels.map(level => [
    level, {
      solved: entries.filter(entry => entry.difficulty === level && catalogProgress?.get(entry.id) === 'solved').length +
        (generatedProgress.solved.get(level) ?? 0),
      averageSeconds: null,
    },
  ]))
  const group = entries.filter(entry => entry.difficulty === difficulty)
  const next = group.find(entry => !catalogProgress?.has(entry.id))
    ?? group.find(entry => catalogProgress?.get(entry.id) === 'started') ?? group[0]
  const busy = generation.pending !== null
  const GameIcon = { kakuro: Hash, calcudoku: Calculator, futoshiki: MoveHorizontal, hidato: PathIcon, rullo: Sigma }[game]

  function start() {
    if (generatedEntry) generation.generate(difficulty)
    else if (next) {
      rememberNumberDifficulty(game, difficulty)
      void router.navigate({ ...puzzleDestination(game, next), state: { fromNumberDifficulty: game } })
    }
  }

  return <main className="puzzles-page puzzles-subscreen new-puzzle-page puzzles-difficulty-page">
    <div className="puzzles-layout">
      <NumberGameHeading game={game} title="Choose difficulty" />
      <PuzzlesSectionNav active="new" />
      <div className="main-menu-panel motion-screen">
        <PuzzleDifficultyStep name={name}
          preview={<span className="variant-preview number-difficulty-preview" aria-hidden="true"><GameIcon size={28} /></span>}
          busy={busy} disabled={!ready} error={generation.error} onStart={start}
          startLabel={`Start ${numberPuzzleDifficultyLabels[difficulty].toLowerCase()} puzzle`}
          actions={generatedEntry && next && <Link className={buttonClassName('quiet')}
            {...puzzleDestination(game, next)} state={{ fromNumberDifficulty: game }}
            onClick={event => {
              if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) rememberNumberDifficulty(game, difficulty)
            }}>Play a catalog puzzle</Link>}>
          <DifficultyOptions levels={levels} selected={difficulty} onChange={setDifficulty} disabled={busy || !ready} statistics={statistics} />
        </PuzzleDifficultyStep>
        {active.length > 0 && <NumberResumeList game={game} entries={active} />}
      </div>
    </div>
  </main>
}

/** Use for standalone play with a game-specific board, check, and hint function. */
export function NumberGamePlay<Entry extends NumberPuzzleEntry>({ config, entry }: {
  config: NumberGameConfig<Entry>; entry: Entry
}) {
  return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout number-puzzle-layout">
      <NumberPuzzleBoard config={config} entry={entry} key={entry.id} />
    </div>
  </main>
}

const insightTabs = [
  { id: 'solution', label: 'Solution', Icon: ListOrdered },
  { id: 'techniques', label: TECHNIQUE_FINDER_TITLE, Icon: ListFilter },
] as const
type Insight = typeof insightTabs[number]['id']
type HintSelection = { choices: readonly Hint[]; index: number; depth: number }

function NumberPuzzleBoard<Entry extends NumberPuzzleEntry>({ config, entry }: { config: NumberGameConfig<Entry>; entry: Entry }) {
  const { game, name, rules, hasClueCells, generatedEntry } = config
  const generatedGame = entry.generated && generatedEntry ? game : null
  const generation = useNumberPuzzleGeneration(generatedEntry ? game : null, true)
  const board = useMemo(() => config.board(entry), [config, entry])
  const { editable, key, load } = useMemo(() => boardPosition(game, entry.id, board), [game, entry.id, board])
  const { width, height, maxValue, cellChoices, mirrorEdgeClues } = board
  const digits = useMemo(() => Array.from({ length: maxValue }, (_, i) => i + 1), [maxValue])
  const [progress, setProgress] = useState<NumberProgress>(() => ({
    position: emptyNumberPosition(board.cells.length), past: [], future: [],
  }))
  const { position, past, future } = progress
  const [ready, setReady] = useState(false)
  const [number, setNumber] = useState(entry.number)
  const [selection, setSelection] = useState(() => editable.indexOf(true))
  const [notes, setNotes] = useState(false)
  const [numberInput, setNumberInput] = useState('')
  const numberField = useRef<HTMLInputElement>(null)
  const [showCheck, setShowCheck] = useState(false)
  const [checkResult, setCheckResult] = useState<DialogResult | null>(null)
  const mobile = useMobileLayout()
  const [hintSelection, setHint] = useState<HintSelection | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [mobileInsight, setMobileInsight] = useState<Insight | null>(null)
  const [insights, setInsights] = useState<{ open: Insight[]; active: Insight | null }>({ open: [], active: null })
  const [rearranging, setRearranging] = useState(false)
  const [solution, setSolution] = useState<ReturnType<typeof numberSolution<Hint>> | null>(null)
  const [solutionIndex, setSolutionIndex] = useState(0)
  const [showSolutionHint, setShowSolutionHint] = useState(false)
  const [status, setStatus] = useState('')
  const [storageError, setStorageError] = useState(false)
  const lastSave = useRef(0)
  const cellButtons = useRef(new Map<number, HTMLButtonElement>())
  const actionsButton = useRef<HTMLButtonElement>(null)
  const actionsMenu = useRef<HTMLDivElement>(null)
  const result = useMemo(() => board.check(position.values), [board, position.values])
  const conflictCells = new Set(showCheck ? result.marked : [])
  const hint = hintSelection?.choices[hintSelection.index]
  const depth = hintSelection?.depth ?? 0
  const shortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.getSnapshot, shortcutStore.getServerSnapshot)
  const previewing = mobile ? mobileInsight === 'solution' : insights.active === 'solution'
  const analysisOpen = mobile ? mobileInsight === 'techniques' : insights.active === 'techniques'
  const found = useMemo(() => analysisOpen && !result.complete && !result.marked.length ? board.hints(position.values) : [],
    [analysisOpen, board, position.values, result])
  const locked = !ready || result.complete || previewing
  const overlayOpen = actionsOpen || rulesOpen || checkResult !== null || mobileInsight !== null

  useEffect(() => {
    if (generatedGame) {
      let active = true
      void openGeneratedNumberPuzzle(generatedGame, entry.id).then(record => {
        if (!active) return
        const stored = record.progress && parseNumberProgress(record.progress, editable, maxValue)
        if (stored) setProgress(stored)
        setNumber(record.number)
        setReady(true)
      })
      return () => { active = false }
    }
    const stored = load()
    if (stored) setProgress(stored)
    setReady(true)
  }, [editable, entry.id, generatedGame, load, maxValue])

  function positionActionsMenu(menu: HTMLDivElement) {
    const anchor = actionsButton.current?.getBoundingClientRect()
    if (!anchor) return
    const bounds = menu.getBoundingClientRect()
    const top = anchor.bottom + bounds.height + 14 <= window.innerHeight
      ? anchor.bottom + 6 : anchor.top - bounds.height - 6
    menu.style.top = `${Math.max(8, top)}px`
    menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8))}px`
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }

  function update(next: NumberProgress) {
    setProgress(next)
    if (generatedGame) {
      const save = ++lastSave.current
      void saveGeneratedNumberProgress(generatedGame, entry.id, next).then(saved => {
        if (save === lastSave.current) setStorageError(!saved)
      })
    } else setStorageError(!saveNumberProgress(key, next))
    setShowCheck(false)
    setHint(null)
    setStatus('')
  }

  function readCell(cell: number): NumberMove {
    return [cell, position.values[cell], position.notes[cell]]
  }

  function applyMove([cell, value, marks]: NumberMove, past: NumberMove[], future: NumberMove[]) {
    const next = { values: [...position.values], notes: [...position.notes] }
    next.values[cell] = value
    next.notes[cell] = marks
    update({ position: next, past, future })
  }

  function enter(value: number, cell = selection, pencil = notes) {
    if (locked || !editable[cell] || !Number.isInteger(value) || value < 0 || value > maxValue) return
    const previous = readCell(cell)
    const [, digit, marks] = previous
    const addNote = value > 0 && pencil
    if (addNote ? digit !== 0 : value === digit && !marks) return
    const next: NumberMove = addNote ? [cell, 0, marks ^ (1 << (value - 1))] : [cell, value, 0]
    applyMove(next, [...past.slice(1 - NUMBER_HISTORY_SIZE), previous], [])
  }

  function undo() {
    const previous = past.at(-1)
    if (locked || !previous) return
    applyMove(previous, past.slice(0, -1), [...future.slice(1 - NUMBER_HISTORY_SIZE), readCell(previous[0])])
  }

  function redo() {
    const next = future.at(-1)
    if (locked || !next) return
    applyMove(next, [...past.slice(1 - NUMBER_HISTORY_SIZE), readCell(next[0])], future.slice(0, -1))
  }

  const onPlayKey = useEffectEvent((event: KeyboardEvent) => {
    if (locked || overlayOpen || rearranging || event.defaultPrevented || event.isComposing || event.altKey) return
    const target = event.target
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, a, dialog[open]'))) return
    if (hint && depth === 3 && shortcutMatches(event, shortcuts, 'applyEdits')) {
      event.preventDefault()
      if (!event.repeat) applyHint()
      return
    }
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key !== 'z' && key !== 'y') return
    event.preventDefault()
    if (key === 'y' || event.shiftKey) redo()
    else undo()
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => onPlayKey(event)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function onGridKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && hintSelection) {
      closeHint()
      return
    }
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
    } else if (cellChoices) {
      return
    } else if (/^[1-9]$/.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      if (maxValue > 9 && /^[1-9]$/.test(event.key) && !locked && editable[selection]) {
        setNumberInput(event.key)
        numberField.current?.focus()
      } else enter(Number(event.key) || 0)
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault()
      setNotes(current => !current)
    }
  }

  function closeActions() {
    setActionsOpen(false)
    if (actionsMenu.current?.matches(':popover-open')) actionsMenu.current.hidePopover()
  }

  const conflictMessage = hasClueCells ? 'Resolve the highlighted clues first.' : 'Resolve the highlighted entries first.'

  function requestHint() {
    closeActions()
    const choices = board.hints(position.values, 1)
    setHint(choices.length ? { choices, index: 0, depth: 0 } : null)
    setShowCheck(!choices.length && result.marked.length > 0)
    setStatus(choices.length ? '' : result.marked.length ? conflictMessage
      : cellChoices ? 'No choice follows from the current clues.' : 'No logical placement found for these entries.')
  }

  function closeHint() {
    setHint(null)
    actionsButton.current?.focus({ preventScroll: true })
  }

  function applyHint() {
    if (!hint) return
    enter(hint.value, hint.cell, false)
    cellButtons.current.get(hint.cell)?.focus({ preventScroll: true })
  }

  function selectCell(index: number) {
    if (index !== selection) setNumberInput('')
    setSelection(index)
  }

  function closeInsight(id: Insight, fromMenu = false) {
    if (mobile) setMobileInsight(null)
    else setInsights(current => {
      const open = current.open.filter(tab => tab !== id)
      return { open, active: current.active === id ? open.at(-1) ?? null : current.active }
    })
    if (!fromMenu) actionsButton.current?.focus({ preventScroll: true })
  }

  function openInsight(id: Insight, fromMenu = false) {
    if (!fromMenu) closeActions()
    if (id === 'solution') {
      if (!solution) setSolution(numberSolution(board, editable))
      setSolutionIndex(0)
      setShowSolutionHint(false)
      setShowCheck(false)
      setHint(null)
      setStatus('')
    }
    if (id === 'techniques' && result.marked.length) setShowCheck(true)
    if (mobile) setMobileInsight(id)
    else setInsights(current => ({
      open: current.open.includes(id) ? current.open : [...current.open, id],
      active: id,
    }))
  }

  function cellName(index: number) {
    return `R${Math.floor(index / width) + 1}C${index % width + 1}`
  }

  function nextPuzzle() {
    return config.entries.find(candidate => {
      if (candidate.difficulty !== entry.difficulty || candidate.id === entry.id) return false
      const candidateBoard = config.board(candidate)
      return !candidateBoard.check(boardPosition(game, candidate.id, candidateBoard).load()?.position.values ?? []).complete
    })
  }

  function placement(hint: Hint) {
    const choice = cellChoices?.labels[hint.value - 1]
    return choice ? `${choice} ${board.cells[hint.cell].printed} in ${cellName(hint.cell)}`
      : `Place ${hint.value} in ${cellName(hint.cell)}`
  }

  function explanation(hint: Hint) {
    return <><DeductionExplanation explanationSteps={hint.reasons} />{hint.renderExplanation?.(cellName)}</>
  }

  function renderGrid(preview?: { values: readonly number[]; hint: Hint | null }) {
    const shownHint = preview ? preview.hint : depth >= 2 ? hint : undefined
    const context = new Set(preview || depth >= 3 ? shownHint?.marked : [])
    function renderBlock(index: number, copy?: 'top' | 'left' | 'corner') {
      const { label, decoration } = board.cells[index]
      const named = !copy && Boolean(label)
      return <div key={copy ? `${copy}-${index}` : index} className="number-puzzle-block" data-clue={Boolean(label)}
        data-conflict={!preview && conflictCells.has(index)} data-hint={context.has(index)}
        role={named ? 'img' : undefined} aria-label={named ? `${cellName(index)}: ${label}` : undefined}
        aria-hidden={named ? undefined : true}>
        {decoration}
      </div>
    }

    function renderCell({ label, block, decoration, edges, given, endpoint, printed }: BoardCell, index: number) {
      if (block) return renderBlock(index)
      const value = given || (preview?.values ?? position.values)[index]
      const marks = preview ? [] : digits.filter(digit => position.notes[index] & (1 << (digit - 1)))
      const description = printed !== undefined ? String(printed)
        : given ? `given ${given}` : value ? String(value) : marks.length ? `notes ${marks.join(', ')}` : 'empty'
      return <button key={index} type="button" className="number-puzzle-cell"
        ref={preview ? undefined : button => { if (button) cellButtons.current.set(index, button); else cellButtons.current.delete(index) }}
        tabIndex={selection === index ? 0 : -1}
        aria-pressed={cellChoices ? value !== cellChoices.off : preview ? undefined : selection === index}
        disabled={Boolean(preview)} aria-disabled={cellChoices && !preview && locked ? true : undefined}
        data-entry={Boolean(value && !given)} data-choice={cellChoices && value}
        data-conflict={!preview && conflictCells.has(index)} data-hint={shownHint?.cell === index} data-context={context.has(index)}
        data-edges={edges} data-given={Boolean(given)} data-endpoint={endpoint} data-decorated={Boolean(decoration)}
        aria-label={`${cellName(index)}, ${description}${label ? ', ' + label : ''}`}
        onFocus={() => selectCell(index)} onClick={() => {
          selectCell(index)
          if (cellChoices) enter(value === cellChoices.off ? 0 : cellChoices.off, index, false)
        }}>
        {decoration}
        {printed !== undefined ? <span>{printed}</span> : value ? endpoint ? <span className="number-puzzle-endpoint">{value}</span> : value
          : maxValue > 9 ? <span className="number-puzzle-multi-notes" aria-hidden="true">{marks.join(' ')}</span>
            : <span className="number-puzzle-notes" aria-hidden="true">{digits.map(digit =>
              <span key={digit}>{marks.includes(digit) ? digit : ''}</span>)}</span>}
      </button>
    }

    return (
      <div className="number-puzzle-grid" data-game={game} data-toggle-cells={Boolean(cellChoices) || undefined}
        role="group" aria-label={`${name} ${preview ? 'solution' : 'board'}`}
        style={{ '--number-puzzle-columns': width + Number(Boolean(mirrorEdgeClues)) } as CSSProperties}
        onKeyDown={preview ? undefined : onGridKey}>
        {mirrorEdgeClues && renderBlock(board.cells.length - 1, 'corner')}
        {mirrorEdgeClues && board.cells.slice(-width).map((_, column) => renderBlock((height - 1) * width + column, 'top'))}
        {mirrorEdgeClues ? board.cells.flatMap((cell, index) => index % width === 0
          ? [renderBlock(index + width - 1, 'left'), renderCell(cell, index)] : [renderCell(cell, index)])
          : board.cells.map(renderCell)}
      </div>
    )
  }

  const next = ready && result.complete && !entry.generated ? nextPuzzle() : undefined
  const trace = useMemo<NumberSolutionTrace | null>(() => solution && ({
    status: solution.complete ? 'solved' : 'stalled',
    steps: solution.steps.map(step => step ? { title: step.technique, text: `${placement(step)}.` } : {
      title: 'Search', text: cellChoices ? 'Check the remaining possible choices.' : 'Find the remaining placements by checking possible values.',
    }),
  }), [solution, width, board])
  const solutionStep = solution?.steps[solutionIndex]
  const solutionCopy = trace && (solutionStep ? { title: placement(solutionStep), text: '' }
    : solutionIndex === trace.steps.length ? solutionEndSummary(trace.status)
      : { title: 'Search', text: 'The solver checked possible values to finish the grid. Select Final grid to see the result.' })
  const solutionPreview = solution && { values: solution.positions[solutionIndex], hint: solutionStep ?? null }
  const solutionProps = trace && {
    state: { status: 'ready' as const, trace }, index: solutionIndex, onSelect: (index: number) => {
      setSolutionIndex(index)
      setShowSolutionHint(true)
    },
    onRetry: () => setSolution(numberSolution(board, editable)), onClose: () => closeInsight('solution'),
  }
  const counts = new Map<string, number>()
  for (const move of found) counts.set(move.technique, (counts.get(move.technique) ?? 0) + 1)
  const analysisProps = {
    title: name, techniques: config.techniques, counts, solved: result.complete,
    unit: cellChoices ? 'Choices' : undefined,
    problem: result.marked.length ? conflictMessage : undefined,
    onSelectTechnique: (technique: string) => {
      const choices = found.filter(move => move.technique === technique)
      if (!choices.length) return
      if (mobile) closeInsight('techniques')
      setHint({ choices, index: 0, depth: 0 })
      setStatus('')
    },
  }

  const hintStage = [cellChoices ? 'Show choice' : 'Show digits', 'Show location', 'Show explanation', 'Apply hint'][depth]
  const hintChoice = hint && cellChoices?.labels[hint.value - 1]
  const hintPanel = !mobile && previewing && showSolutionHint && solutionCopy ? <PlayHint mobile={false}>
    <HintCard hint={solutionCopy} onClose={() => setShowSolutionHint(false)}
      detail={solutionStep && explanation(solutionStep)} />
  </PlayHint> : !previewing && hint && hintSelection ? <PlayHint mobile={mobile}>
    <HintCard hint={{
      title: depth >= 2 ? placement(hint) : hint.technique,
      text: hintChoice ? depth === 0 ? 'Use this technique to make a choice.'
        : depth === 1 ? `Look for a number to ${hintChoice.toLowerCase()}.`
          : depth === 3 ? 'The targets require this choice.' : ''
        : depth === 0 ? 'Use this technique to find a placement.'
        : depth === 1 ? `Look for a place for ${hint.value}.`
          : depth === 3 ? `These rules leave only ${hint.value} for ${cellName(hint.cell)}.` : '',
    }} onClose={closeHint}
      detail={depth === 3 && explanation(hint)}
      navigation={hintSelection.choices.length > 1 ? {
        index: hintSelection.index, count: hintSelection.choices.length,
        onMove: offset => setHint(current => current && {
          ...current, depth: 0, index: (current.index + offset + current.choices.length) % current.choices.length,
        }),
      } : undefined}
      lessDetail={{ disabled: depth === 0, onClick: () => setHint(current => current && { ...current, depth: current.depth - 1 }) }}
      action={depth === 3 ? { label: hintStage, onClick: applyHint, shortcut: shortcutLabel(shortcuts.applyEdits) }
        : { label: hintStage, onClick: () => setHint(current => current && { ...current, depth: current.depth + 1 }) }} />
  </PlayHint> : null

  const actionItems = <>
    <button type="button" disabled={locked} onClick={requestHint}><Lightbulb size={17} /> View hint</button>
    <button type="button" disabled={locked} onClick={() => { closeActions(); checkPuzzle() }}><Check size={17} /> Check puzzle</button>
    <div className="app-menu-separator" role="separator" />
    {insightTabs.map(({ id, label, Icon }) => {
      const open = insights.open.includes(id)
      const returnToPuzzle = mobile && previewing && id === 'solution'
      return <button key={id} type="button" disabled={!ready || (result.complete && !returnToPuzzle)}
        aria-pressed={mobile ? undefined : open} aria-label={mobile && id === 'solution' && !returnToPuzzle ? 'Open solution panel' : undefined}
        onClick={() => {
          if (returnToPuzzle) { closeActions(); closeInsight(id) }
          else if (mobile) openInsight(id)
          else if (open) closeInsight(id, true)
          else openInsight(id, true)
        }}><Icon size={17} aria-hidden="true" /> {returnToPuzzle ? 'Return to puzzle' : label}</button>
    })}
    <button type="button" onClick={() => { closeActions(); setRulesOpen(true) }}><Info size={17} /> How to play</button>
  </>

  function checkPuzzle() {
    setHint(null)
    setShowCheck(true)
    setStatus('')
    const conflict = result.marked.length > 0
    const text = cellChoices
      ? conflict ? 'The highlighted targets cannot fit these choices.' : 'Each target fits the current choices.'
      : hasClueCells
      ? conflict ? 'The highlighted clues cannot fit these entries.' : 'Each clue fits the current entries.'
      : conflict ? 'The highlighted entries conflict with the rules.' : 'The entries fit the rules checked so far.'
    setCheckResult({ title: 'Puzzle check', text, tone: conflict ? 'error' : 'neutral' })
  }

  const puzzlePanel = <section className="surface number-puzzle-board-card">
    <NumberGameHeading game={game} title={name} inPlay>
      <small>{entry.generated && 'Generated · '}{numberPuzzleDifficultyLabels[entry.difficulty]} {number}</small>
    </NumberGameHeading>
    {renderGrid(!mobile && previewing ? solutionPreview ?? undefined : undefined)}
  </section>

  const inputPanel = <div className="workspace-controls number-puzzle-input-panel">
    <section className={`surface controls number-puzzle-controls${mobile ? ' compact-controls' : ''}`}
      data-toggle-cells={Boolean(cellChoices) || undefined} aria-label={`${name} controls`}>
      <div className="controls-content">
        <div className="side-actions left-actions" role="group" aria-label="Puzzle actions">
          <IconButton className="history-button" aria-label="Undo" title="Undo" disabled={locked || !past.length} onClick={undo}><Undo2 size={18} /></IconButton>
          <IconButton className="history-button" aria-label="Redo" title="Redo" disabled={locked || !future.length} onClick={redo}><Redo2 size={18} /></IconButton>
          <div className="controls-actions-wrap">
            <PlayActionsButton ref={actionsButton} mobile={mobile} open={actionsOpen} disabled={!ready}
              popoverTarget={mobile ? undefined : 'input-actions-menu'} onClick={mobile ? () => setActionsOpen(true) : undefined} />
            {!mobile && <div ref={actionsMenu} id="input-actions-menu" className="app-menu puzzle-menu desktop-actions-menu"
              popover="auto" onToggle={event => {
                const open = event.currentTarget.matches(':popover-open')
                setActionsOpen(open)
                if (open) positionActionsMenu(event.currentTarget)
              }}>{actionItems}</div>}
          </div>
        </div>
        {!cellChoices && <div className="keypad-stack">
          {maxValue > 9 ? <form className="number-puzzle-input" onSubmit={event => {
            event.preventDefault()
            const value = Number(numberInput)
            if (!value || value > maxValue) return
            enter(value)
            setNumberInput('')
            cellButtons.current.get(selection)?.focus()
          }}>
            <input ref={numberField} value={numberInput} aria-label={`Number from 1 to ${maxValue}`}
              placeholder={`1 to ${maxValue}`} inputMode="numeric" maxLength={String(maxValue).length}
              disabled={locked || !editable[selection]} onChange={event => setNumberInput(event.currentTarget.value.replace(/\D/g, ''))} />
            <Button type="submit" variant="primary" disabled={locked || !editable[selection] || !Number(numberInput) || Number(numberInput) > maxValue}>
              {notes ? 'Add note' : 'Place'}
            </Button>
          </form> : <PuzzleKeypad label="Digit pad" variant={maxValue === 4 ? 'mini' : maxValue === 6 ? 'six' : undefined}>
            {digits.map(digit => <button key={digit} type="button" className="key"
              aria-label={`Enter ${digit}`} disabled={locked || !editable[selection]}
              onClick={() => enter(digit)}>{digit}</button>)}
          </PuzzleKeypad>}
        </div>}
        {!cellChoices && <div className="side-actions right-actions" role="group" aria-label="Input modes">
          <IconButton aria-label="Pencil mode" title="Pencil mode" aria-pressed={notes} disabled={locked}
            onClick={() => setNotes(current => !current)}><Pencil size={18} /></IconButton>
          <IconButton aria-label="Erase cell" title="Erase cell"
            disabled={locked || !editable[selection]}
            onClick={() => enter(0)}><Delete size={18} /></IconButton>
        </div>}
      </div>
    </section>
    <div className="number-puzzle-status" role="status" aria-live="polite">
      {result.complete ? 'Puzzle solved.' : status}
    </div>
    {result.complete && (next
      ? <Link className={buttonClassName('primary')} {...puzzleDestination(game, next)}
        state={{ fromNumberDifficulty: game }} replace>Next puzzle</Link>
      : config.generatedEntry
        ? <Button variant="primary" disabled={generation.pending !== null} onClick={() => generation.generate(entry.difficulty)}>
          {generation.pending ? 'Generating…' : 'Generate next puzzle'}
        </Button>
        : <Link className={buttonClassName('primary')} to={`/puzzles/${game}`}>Choose difficulty</Link>)}
    {generation.error && <p role="alert">{generation.error}</p>}
    {storageError && <p className="form-error" role="alert">This browser cannot save your progress.</p>}
  </div>

  return <div className="workspace number-puzzle-play motion-screen">
    <PlayLayout desktop={!mobile} puzzle={puzzlePanel} input={inputPanel} hint={hintPanel}
      mobile={{
        puzzleId: key, rearranging, onRearrangingChange: setRearranging, withHint: Boolean(hintPanel),
        blocked: overlayOpen, inputTitle: result.complete ? 'Next puzzle' : cellChoices ? 'Controls' : 'Keypad',
        hintSwipe: hint ? { dismiss: closeHint, apply: depth === 3 ? { label: 'Apply hint', onClick: applyHint } : undefined } : undefined,
      }}
      insights={insights.active ? {
        tabs: insightTabs.filter(tab => insights.open.includes(tab.id)), active: insights.active,
        onSelect: active => setInsights(current => ({ ...current, active })),
        onClose: () => { if (insights.active) closeInsight(insights.active) },
        content: insights.active === 'solution' && solutionProps ? <SolutionPath {...solutionProps} embedded />
          : <PlacementAnalysis {...analysisProps} />,
      } : undefined} />
    {mobile && <Modal title="Actions" className="puzzle-actions-sheet" open={actionsOpen}
      motionSpeed="overlay" onClose={closeActions}>
      <div className="app-menu puzzle-menu" id="mobile-actions-menu">{actionItems}</div>
    </Modal>}
    <Modal title={`${name} rules`} open={rulesOpen} onClose={() => setRulesOpen(false)}>
      <div className="variant-rules-copy"><p>{rules}</p></div>
    </Modal>
    {checkResult && <PuzzleCheckResult result={checkResult} onClose={() => setCheckResult(null)} />}
    {mobile && mobileInsight === 'techniques' && <PuzzleAnalysis {...analysisProps} close={() => closeInsight('techniques')} />}
    {mobile && previewing && solutionProps && solutionPreview && <SolutionDialog {...solutionProps}
      grid={renderGrid(solutionPreview)} explanation={solutionCopy} detail={solutionStep && explanation(solutionStep)} />}
  </div>
}
