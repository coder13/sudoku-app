import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import { Calculator, Check, ChevronLeft, ChevronRight, Hash, Delete, Info, Lightbulb, ListFilter, ListOrdered, Pencil, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { numberPuzzleDifficulties, numberPuzzleDifficultyLabels, type NumberPuzzleDifficulty, type NumberPuzzleEntry } from '../number-puzzles/catalog'
import type { DifficultyStatistics } from '../sudoku/difficulty-statistics'
import { emptyNumberPosition, loadNumberDifficulty, loadNumberPosition, rememberNumberDifficulty, saveNumberPosition, type NumberPosition } from '../number-puzzles/progress'
import { IconButton, buttonClassName, iconButtonClassName } from './Button'
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
import { PuzzleKeypad } from './PuzzleKeypad'
import './puzzle-games.css'
import './number-puzzle.css'

export type NumberGame = 'kakuro' | 'calcudoku'

type BoardCell = {
  label?: string
  given?: number
  decoration?: ReactNode
  edges?: string
  block?: boolean
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
  check: (values: readonly number[]) => { complete: boolean; marked: number[] }
  hints: (values: readonly number[], limit?: number) => readonly Hint[]
  solve: () => readonly number[] | null
}

export type NumberGameConfig<Entry extends NumberPuzzleEntry> = {
  game: NumberGame
  name: string
  rules: string
  entries: readonly Entry[]
  techniques: readonly string[]
  board: (entry: Entry) => NumberBoard
  hasClueCells?: boolean
}

function positionKey(game: NumberGame, id: string) {
  return `${game}.position.v1.${id}`
}

function puzzleDestination(game: NumberGame, entry: NumberPuzzleEntry) {
  return {
    to: `/puzzles/${game}/$puzzle` as const,
    params: { puzzle: entry.id },
  }
}

function boardPosition(game: NumberGame, id: string, board: NumberBoard) {
  const key = positionKey(game, id)
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

/** Use for the difficulty and resume page of a standalone number puzzle. */
export function NumberGameDifficulty<Entry extends NumberPuzzleEntry>({ config }: { config: NumberGameConfig<Entry> }) {
  const { entries, game, name } = config
  const router = useRouter()
  const levels = numberPuzzleDifficulties.filter(level => entries.some(entry => entry.difficulty === level))
  const [difficulty, setDifficulty] = useState<NumberPuzzleDifficulty>(levels[0])
  const [started, setStarted] = useState<ReadonlySet<string>>(new Set())
  const [solved, setSolved] = useState<ReadonlySet<string>>(new Set())
  const [ready, setReady] = useState(false)

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
    const savedDifficulty = loadNumberDifficulty(game)
    if (savedDifficulty && entries.some(entry => entry.difficulty === savedDifficulty)) setDifficulty(savedDifficulty)
    setReady(true)
  }, [config, entries, game])

  const active = entries.filter(entry => started.has(entry.id))
  const statistics = new Map<NumberPuzzleDifficulty, DifficultyStatistics>(levels.map(level => [
    level, { solved: entries.filter(entry => entry.difficulty === level && solved.has(entry.id)).length, averageSeconds: null },
  ]))
  const group = entries.filter(entry => entry.difficulty === difficulty)
  const next = group.find(entry => !started.has(entry.id) && !solved.has(entry.id))
    ?? group.find(entry => started.has(entry.id)) ?? group[0]
  const GameIcon = game === 'kakuro' ? Hash : Calculator

  function start() {
    if (!next) return
    rememberNumberDifficulty(game, difficulty)
    void router.navigate({ ...puzzleDestination(game, next), state: { fromNumberDifficulty: game } })
  }

  return <main className="puzzles-page puzzles-subscreen new-puzzle-page puzzles-difficulty-page">
    <div className="puzzles-layout">
      <NumberGameHeading game={game} title="Choose difficulty" />
      <PuzzlesSectionNav active="new" />
      <div className="main-menu-panel motion-screen">
        <PuzzleDifficultyStep name={name}
          preview={<span className="variant-preview number-difficulty-preview" aria-hidden="true"><GameIcon size={28} /></span>}
          disabled={!ready} onStart={start}
          startLabel={`Start ${numberPuzzleDifficultyLabels[difficulty].toLowerCase()} puzzle`}>
          <DifficultyOptions levels={levels} selected={difficulty} onChange={setDifficulty} disabled={!ready} statistics={statistics} />
        </PuzzleDifficultyStep>
        {active.length > 0 && <section className="number-puzzle-resume new-puzzle-step" aria-labelledby="number-puzzle-resume-title">
          <h2 id="number-puzzle-resume-title">In progress</h2>
          <ul className="game-list main-puzzle-list">
            {active.map(entry => <li key={entry.id}><Link className="game-row" {...puzzleDestination(game, entry)} state={{ fromNumberDifficulty: game }}>
              <span className="game-row-copy"><strong>{numberPuzzleDifficultyLabels[entry.difficulty]} {entry.number}</strong></span>
              <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
            </Link></li>)}
          </ul>
        </section>}
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
  { id: 'solution', label: 'Solution' },
  { id: 'techniques', label: TECHNIQUE_FINDER_TITLE },
] as const
type Insight = typeof insightTabs[number]['id']
type HintSelection = { choices: readonly Hint[]; index: number; depth: number }

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
  const cellButtons = useRef(new Map<number, HTMLButtonElement>())
  const actionsButton = useRef<HTMLButtonElement>(null)
  const actionsMenu = useRef<HTMLDivElement>(null)
  const result = useMemo(() => board.check(position.values), [board, position.values])
  const conflictCells = new Set(showCheck ? result.marked : [])
  const hint = hintSelection?.choices[hintSelection.index]
  const depth = hintSelection?.depth ?? 0
  const previewing = mobile ? mobileInsight === 'solution' : insights.active === 'solution'
  const analysisOpen = mobile ? mobileInsight === 'techniques' : insights.active === 'techniques'
  const found = useMemo(() => analysisOpen && !result.complete && !result.marked.length ? board.hints(position.values) : [],
    [analysisOpen, board, position.values, result])
  const locked = !ready || result.complete || previewing

  useEffect(() => {
    const stored = load()
    if (stored) setPosition(stored)
    setReady(true)
  }, [load])

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

  function update(next: NumberPosition) {
    setPosition(next)
    setStorageError(!saveNumberPosition(key, next))
    setShowCheck(false)
    setHint(null)
    setStatus('')
  }

  function enter(value: number, cell = selection, pencil = notes) {
    if (locked || !editable[cell] || !Number.isInteger(value) || value < 0 || value > maxValue) return
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
    } else if (/^[1-9]$/.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      enter(Number(event.key) || 0)
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
    setStatus(choices.length ? '' : result.marked.length ? conflictMessage : 'No logical placement found for these entries.')
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

  function closeInsight(id: Insight) {
    if (mobile) setMobileInsight(null)
    else setInsights(current => {
      const open = current.open.filter(tab => tab !== id)
      return { open, active: open.at(-1) ?? null }
    })
    actionsButton.current?.focus({ preventScroll: true })
  }

  function openInsight(id: Insight) {
    closeActions()
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
      return !candidateBoard.check(boardPosition(game, candidate.id, candidateBoard).load()?.values ?? []).complete
    })
  }

  function placement(hint: Hint) {
    return `Place ${hint.value} in ${cellName(hint.cell)}`
  }

  function explanation(hint: Hint) {
    return <><DeductionExplanation explanationSteps={hint.reasons} />{hint.renderExplanation?.(cellName)}</>
  }

  function renderGrid(preview?: { values: readonly number[]; hint: Hint | null }) {
    const shownHint = preview ? preview.hint : depth >= 2 ? hint : undefined
    const context = new Set(preview || depth >= 3 ? shownHint?.marked : [])
    return (
      <div className="number-puzzle-grid" data-game={game} role="group" aria-label={`${name} ${preview ? 'solution' : 'board'}`}
        style={{ '--number-puzzle-columns': width } as CSSProperties} onKeyDown={preview ? undefined : onGridKey}>
        {board.cells.map(({ label, block, decoration, edges, given }, index) => {
          if (block) {
            return <div key={index} className="number-puzzle-block" data-clue={Boolean(label)}
              data-conflict={!preview && conflictCells.has(index)} data-hint={context.has(index)} role={label ? 'img' : undefined}
              aria-label={label ? `${cellName(index)}: ${label}` : undefined} aria-hidden={label ? undefined : true}>
              {decoration}
            </div>
          }

          const value = given || (preview?.values ?? position.values)[index]
          const marks = preview ? [] : digits.filter(digit => position.notes[index] & (1 << (digit - 1)))
          const description = given ? `given ${given}` : value ? String(value) : marks.length ? `notes ${marks.join(', ')}` : 'empty'
          return <button key={index} type="button" className="number-puzzle-cell"
            ref={preview ? undefined : button => { if (button) cellButtons.current.set(index, button); else cellButtons.current.delete(index) }}
            tabIndex={selection === index ? 0 : -1} aria-pressed={preview ? undefined : selection === index}
            disabled={Boolean(preview)} data-entry={Boolean(value && !given)}
            data-conflict={!preview && conflictCells.has(index)} data-hint={shownHint?.cell === index} data-context={context.has(index)}
            data-edges={edges} data-given={Boolean(given)} data-decorated={Boolean(decoration)}
            aria-label={`${cellName(index)}, ${description}${label ? ', ' + label : ''}`}
            onFocus={() => setSelection(index)} onClick={() => setSelection(index)}>
            {decoration}
            {value || <span className="number-puzzle-notes" aria-hidden="true">{digits.map(digit =>
              <span key={digit}>{marks.includes(digit) ? digit : ''}</span>)}</span>}
          </button>
        })}
      </div>
    )
  }

  const next = ready && result.complete ? nextPuzzle() : undefined
  const trace = useMemo<NumberSolutionTrace | null>(() => solution && ({
    status: solution.complete ? 'solved' : 'stalled',
    steps: solution.steps.map(step => step ? { title: step.technique, text: `${placement(step)}.` } : {
      title: 'Search', text: 'Find the remaining placements by checking possible values.',
    }),
  }), [solution, width])
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
    problem: result.marked.length ? conflictMessage : undefined,
    onSelectTechnique: (technique: string) => {
      const choices = found.filter(move => move.technique === technique)
      if (!choices.length) return
      if (mobile) closeInsight('techniques')
      setHint({ choices, index: 0, depth: 0 })
      setStatus('')
    },
  }

  const hintStage = ['Show digits', 'Show location', 'Show explanation', 'Apply hint'][depth]
  const hintPanel = !mobile && previewing && showSolutionHint && solutionCopy ? <PlayHint mobile={false}>
    <HintCard hint={solutionCopy} onClose={() => setShowSolutionHint(false)}
      detail={solutionStep && explanation(solutionStep)} />
  </PlayHint> : !previewing && hint && hintSelection ? <PlayHint mobile={mobile}>
    <HintCard hint={{
      title: depth >= 2 ? placement(hint) : hint.technique,
      text: depth === 0 ? 'Use this technique to find a placement.'
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
      action={{ label: hintStage, onClick: depth === 3 ? applyHint
        : () => setHint(current => current && { ...current, depth: current.depth + 1 }) }} />
  </PlayHint> : null

  const actionItems = <>
    <button type="button" disabled={locked} onClick={requestHint}><Lightbulb size={17} /> View hint</button>
    <button type="button" disabled={locked} onClick={() => { closeActions(); checkPuzzle() }}><Check size={17} /> Check puzzle</button>
    <div className="app-menu-separator" role="separator" />
    {previewing ? <button type="button" onClick={() => { closeActions(); closeInsight('solution') }}>
      <ListOrdered size={17} /> Return to puzzle
    </button> : <button type="button" disabled={!ready || result.complete} aria-label="Open solution panel"
      onClick={() => openInsight('solution')}><ListOrdered size={17} /> Solution</button>}
    <button type="button" disabled={!ready || result.complete} onClick={() => openInsight('techniques')}>
      <ListFilter size={17} /> {TECHNIQUE_FINDER_TITLE}
    </button>
    <button type="button" onClick={() => { closeActions(); setRulesOpen(true) }}><Info size={17} /> How to play</button>
  </>

  function checkPuzzle() {
    setHint(null)
    setShowCheck(true)
    setStatus('')
    const conflict = result.marked.length > 0
    const text = hasClueCells
      ? conflict ? 'The highlighted clues cannot fit these entries.' : 'Each clue fits the current entries.'
      : conflict ? 'The highlighted entries conflict with the rules.' : 'The entries fit the rules checked so far.'
    setCheckResult({ title: 'Puzzle check', text, tone: conflict ? 'error' : 'neutral' })
  }

  const puzzlePanel = <section className="surface number-puzzle-board-card">
    <NumberGameHeading game={game} title={name} inPlay>
      <small>{numberPuzzleDifficultyLabels[entry.difficulty]} {entry.number}</small>
    </NumberGameHeading>
    {renderGrid(!mobile && previewing ? solutionPreview ?? undefined : undefined)}
  </section>

  const inputPanel = <div className="workspace-controls number-puzzle-input-panel">
    <section className={`surface controls number-puzzle-controls${mobile ? ' compact-controls' : ''}`} aria-label={`${name} controls`}>
      <div className="controls-content">
        <div className="side-actions left-actions" role="group" aria-label="Puzzle actions">
          <IconButton className="history-button" aria-label="Undo" title="Undo" disabled={locked || !history.length} onClick={undo}><Undo2 size={18} /></IconButton>
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
        <div className="keypad-stack">
          <PuzzleKeypad label="Digit pad" variant={maxValue === 4 ? 'mini' : undefined}>
            {digits.map(digit => <button key={digit} type="button" className="key"
              aria-label={`Enter ${digit}`} disabled={locked || !editable[selection]}
              onClick={() => enter(digit)}>{digit}</button>)}
          </PuzzleKeypad>
        </div>
        <div className="side-actions right-actions" role="group" aria-label="Input modes">
          <IconButton aria-label="Pencil mode" title="Pencil mode" aria-pressed={notes} disabled={locked}
            onClick={() => setNotes(current => !current)}><Pencil size={18} /></IconButton>
          <IconButton aria-label="Erase cell" title="Erase cell" disabled={locked || !editable[selection]}
            onClick={() => enter(0)}><Delete size={18} /></IconButton>
        </div>
      </div>
    </section>
    <div className="number-puzzle-status" role="status" aria-live="polite">
      {result.complete ? 'Puzzle solved.' : status}
    </div>
    {result.complete && (next
      ? <Link className={buttonClassName('primary')} {...puzzleDestination(game, next)}
        state={{ fromNumberDifficulty: game }} replace>Next puzzle</Link>
      : <Link className={buttonClassName('primary')} to={`/puzzles/${game}`}>Choose difficulty</Link>)}
    {storageError && <p className="form-error" role="alert">This browser cannot save your progress.</p>}
  </div>

  return <div className="workspace number-puzzle-play motion-screen">
    <PlayLayout desktop={!mobile} puzzle={puzzlePanel} input={inputPanel} hint={hintPanel}
      mobile={{
        puzzleId: key, rearranging, onRearrangingChange: setRearranging, withHint: Boolean(hintPanel),
        blocked: actionsOpen || rulesOpen || checkResult !== null || mobileInsight !== null, inputTitle: result.complete ? 'Next puzzle' : 'Keypad',
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
