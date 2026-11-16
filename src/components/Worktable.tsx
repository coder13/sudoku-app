import {
  type Dispatch, type MouseEvent, type RefObject, type SetStateAction, useEffect, useMemo, useRef, useState,
} from 'react'
import { Braces, Check, CheckCheck, CircleCheck, CircleX, Info, MoreHorizontal, PencilLine } from 'lucide-react'
import { runEngine, type Analysis } from '../sudoku/engine'
import {
  COLORS, conflictsOf, enter, fillEntries, formatTime, isSolved, redo, replaceCandidates, singleFromCandidates, undo, valuesOf,
  type ErrorMode, type Game, type Mode,
} from '../sudoku/game'
import type { AdvancedModes, AppearancePreferences } from '../sudoku/preferences'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Controls } from './Controls'
import { Modal } from './Modal'

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
}
export type CheckResult = { text: string; tone: 'error' | 'success' | 'neutral' }
type DialogResult = CheckResult & { title: 'Puzzle check' | 'Puzzle action' }

export const validation: Record<Analysis, CheckResult> = {
  conflict: { text: 'Resolve the highlighted conflicts first.', tone: 'error' },
  unsolvable: { text: 'The current grid has no solution.', tone: 'error' },
  unique: { text: 'This puzzle has exactly one solution.', tone: 'success' },
  multiple: { text: 'This puzzle has multiple solutions. Add more givens.', tone: 'error' },
  'search-limit': { text: 'The engine couldn’t verify this grid. Review its givens and try again.', tone: 'neutral' },
}

function rectangle(start: number, end: number) {
  const [top, bottom] = [Math.floor(start / 9), Math.floor(end / 9)].sort((a, b) => a - b)
  const [left, right] = [start % 9, end % 9].sort((a, b) => a - b)
  const result = []
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) result.push(row * 9 + col)
  }
  return result
}

async function solveSingleValues(values: string) {
  let board = values
  for (let step = 0; step < 81; step++) {
    const masks = await runEngine({ type: 'notes', values: board })
    if (!masks) throw new Error('Singles cannot be solved until the grid conflicts are resolved.')
    const single = singleFromCandidates(board, masks)
    if (!single) return board
    const [index, digit] = single
    board = board.slice(0, index) + digit + board.slice(index + 1)
  }
  return board
}

function useTimer(id: string, running: boolean) {
  useEffect(() => {
    if (!running) return
    let started = document.visibilityState === 'visible' ? performance.now() : null

    function tick() {
      if (started === null) return
      const seconds = Math.floor((performance.now() - started) / 1000)
      if (seconds < 1) return
      started += seconds * 1000
      roomStore.update(id, (current) => ({ ...current, elapsed: current.elapsed + seconds }))
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        tick()
        started = null
      } else {
        started = performance.now()
      }
    }

    const timer = window.setInterval(tick, 500)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', tick)
    return () => {
      tick()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', tick)
    }
  }, [id, running])
}

export type WorktableActions = { check: () => void }

export function Worktable({
  game, modalOpen, advancedModes, appearance, errorMode, multi, actionsRef, inputSize, panelHeight, setPanelHeight,
  beginResize, onPublish,
}: {
  game: Game
  modalOpen: boolean
  advancedModes: AdvancedModes
  appearance: AppearancePreferences
  errorMode: ErrorMode
  multi: boolean
  actionsRef: RefObject<WorktableActions | null>
  inputSize: number
  panelHeight: number
  setPanelHeight: Dispatch<SetStateAction<number>>
  beginResize: () => void
  onPublish: () => void
}) {
  const start = game.givens[40] === '0' ? 40 : Math.max(0, game.givens.indexOf('0'))
  const [active, setActive] = useState(start)
  const [selected, setSelected] = useState<number[]>([])
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null)
  const [highlightCandidatePairs, setHighlightCandidatePairs] = useState(false)
  const [pencil, setPencil] = useState(false)
  const [candidateKind, setCandidateKind] = useState<'center' | 'corner'>('corner')
  const [colorMode, setColorMode] = useState(false)
  const [eraseMode, setEraseMode] = useState(false)
  const [solution, setSolution] = useState<string | null>(null)
  const [dialogResult, setDialogResult] = useState<DialogResult | null>(null)
  const [puzzleMenuOpen, setPuzzleMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const anchor = useRef(start)
  const boardRef = useRef<HTMLDivElement>(null)
  const puzzleMenuRef = useRef<HTMLDivElement>(null)
  const puzzleMenuButtonRef = useRef<HTMLButtonElement>(null)
  const values = useMemo(() => valuesOf(game), [game.givens, game.position.entries])
  const conflicts = useMemo(() => conflictsOf(values), [values])
  const draft = game.source === 'draft'
  const mode: Mode = draft ? 'value' : colorMode ? 'color' : pencil
    ? advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
    : 'value'
  const solved = isSolved(game)
  const disabled = false

  useTimer(game.id, !draft && game.started && !solved && !modalOpen && !puzzleMenuOpen && dialogResult === null)

  useEffect(() => {
    if (!puzzleMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!puzzleMenuRef.current?.contains(event.target as Node)) setPuzzleMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setPuzzleMenuOpen(false)
      puzzleMenuButtonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [puzzleMenuOpen])

  useEffect(() => {
    if (advancedModes.colorsEnabled) return
    setColorMode(false)
    setSelectedDigit(null)
  }, [advancedModes.colorsEnabled])

  useEffect(() => {
    let current = true
    setSolution(null)
    if (!draft) {
      void runEngine({ type: 'solve', values: game.givens })
        .then((result) => { if (current) setSolution(result) })
        .catch(() => { /* Checking still works if the solution cannot be loaded. */ })
    }
    return () => { current = false }
  }, [draft, game.givens])

  const errors = useMemo(() => {
    const result = new Set<number>()
    if (errorMode === 'none' || draft) return result
    if (errorMode === 'all') conflicts.forEach((index) => result.add(index))
    if (solution) {
      for (let index = 0; index < 81; index++) {
        if (game.position.entries[index] !== '0' && game.position.entries[index] !== solution[index]) result.add(index)
      }
    }
    return result
  }, [conflicts, draft, errorMode, game.position.entries, solution])

  function edit(transform: (current: Game) => Game) {
    if (disabled) return
    roomStore.update(game.id, transform)
  }

  function input(digit: number, inputMode = mode) {
    if (inputMode === 'color' && digit > COLORS.length) return
    if (digit > 0) setEraseMode(false)
    if (!selected.length) {
      setHighlightCandidatePairs(false)
      setSelectedDigit((current) => digit === 0 || current === digit ? null : digit)
      return
    }
    edit((current) => enter(current, selected, inputMode, digit))
  }

  function clickCell(index: number, event: MouseEvent) {
    setActive(index)
    if (eraseMode && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit((current) => enter(current, [index], 'value', 0))
      setSelected([])
      return
    }
    if (!selected.length && selectedDigit !== null && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      edit((current) => enter(current, [index], mode, selectedDigit))
      return
    }
    setSelectedDigit(null)
    if (event.shiftKey && selected.length) setSelected(rectangle(anchor.current, index))
    else {
      anchor.current = index
      setSelected((current) => (multi || event.metaKey || event.ctrlKey)
        ? current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
        : current.length === 1 && current[0] === index ? [] : [index])
    }
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target
      if (modalOpen || puzzleMenuOpen || dialogResult !== null || event.altKey ||
        (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|A)$/.test(target.tagName)))) return
      const key = event.key.toLowerCase()
      const shortcut = event.ctrlKey || event.metaKey
      if (shortcut && ['z', 'y'].includes(key)) {
        event.preventDefault()
        edit(key === 'y' || event.shiftKey ? redo : undo)
      } else if (!shortcut && ARROWS[event.key] && (target === document.body || boardRef.current?.contains(target as Node))) {
        event.preventDefault()
        const [dy, dx] = ARROWS[event.key]
        const row = Math.min(8, Math.max(0, Math.floor(active / 9) + dy))
        const col = Math.min(8, Math.max(0, active % 9 + dx))
        const next = row * 9 + col
        setActive(next)
        setSelectedDigit(null)
        if (event.shiftKey) setSelected(rectangle(anchor.current, next))
        else {
          anchor.current = next
          setSelected([next])
        }
        boardRef.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus({ preventScroll: true })
      } else if (!shortcut && /^[1-9]$/.test(key)) {
        event.preventDefault()
        input(Number(key))
      } else if (!shortcut && (key === 'delete' || key === 'backspace' || key === '0')) {
        event.preventDefault()
        input(0)
      } else if (!draft && !shortcut && key === 'n') {
        event.preventDefault()
        setEraseMode(false)
        setPencil(false)
        setColorMode(false)
      } else if (!draft && !shortcut && (key === 'c' || key === 'p')) {
        event.preventDefault()
        setEraseMode(false)
        setColorMode(false)
        setPencil((current) => !current)
      } else if (!draft && !shortcut && key === 'b' && advancedModes.colorsEnabled) {
        event.preventDefault()
        setEraseMode(false)
        setPencil(false)
        setSelectedDigit(null)
        setColorMode((current) => !current)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  async function runCheck() {
    if (busy) return
    setPuzzleMenuOpen(false)
    setBusy(true)
    setDialogResult(null)
    try {
      const status = await runEngine({ type: 'analyze', values })
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || valuesOf(current) !== values) return
      if (!draft) {
        setDialogResult(status === 'unique'
          ? { title: 'Puzzle check', text: solved ? 'This puzzle is correct.' : 'Everything entered so far is correct.', tone: 'success' }
          : { title: 'Puzzle check', text: 'This puzzle is not correct yet.', tone: 'error' })
      } else {
        setDialogResult({ title: 'Puzzle check', ...validation[status] })
      }
    } catch (error) {
      setDialogResult({ title: 'Puzzle check', text: (error as Error).message, tone: 'neutral' })
    } finally {
      setBusy(false)
    }
  }

  async function generateCandidates() {
    if (busy) return
    setPuzzleMenuOpen(false)
    setBusy(true)
    try {
      const masks = await runEngine({ type: 'notes', values })
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || valuesOf(current) !== values) return
      if (!masks) {
        setDialogResult({ title: 'Puzzle action', text: 'Candidates cannot be generated until the grid conflicts are resolved.', tone: 'error' })
        return
      }
      roomStore.update(game.id, (latest) => valuesOf(latest) === values ? replaceCandidates(latest, masks) : latest)
    } catch (error) {
      setDialogResult({ title: 'Puzzle action', text: (error as Error).message, tone: 'neutral' })
    } finally {
      setBusy(false)
    }
  }

  async function solveAllSingles() {
    if (busy) return
    setPuzzleMenuOpen(false)
    setBusy(true)
    try {
      const result = await solveSingleValues(values)
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || valuesOf(current) !== values) return
      if (result === values) {
        setDialogResult({ title: 'Puzzle action', text: 'There are no singles to solve right now.', tone: 'neutral' })
        return
      }
      roomStore.update(game.id, (latest) => valuesOf(latest) === values ? fillEntries(latest, result) : latest)
    } catch (error) {
      setDialogResult({ title: 'Puzzle action', text: (error as Error).message, tone: 'neutral' })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    actionsRef.current = { check: () => { void runCheck() } }
    return () => { actionsRef.current = null }
  })

  return (
    <>
      <section className="surface puzzle" aria-label={game.title}>
        <div className="puzzle-actions">
          {draft ? (
            <button className="button primary publish-button" onClick={onPublish}><Check size={17} /> Save puzzle</button>
          ) : (
            <div className="puzzle-menu-wrap" ref={puzzleMenuRef}>
              <button ref={puzzleMenuButtonRef} className="icon-button borderless puzzle-menu-trigger" aria-label="Open puzzle actions"
                title="Puzzle actions" aria-expanded={puzzleMenuOpen} aria-controls="puzzle-menu"
                onClick={() => setPuzzleMenuOpen((open) => !open)}>
                <MoreHorizontal size={20} />
              </button>
              {puzzleMenuOpen && <div className="app-menu puzzle-menu" id="puzzle-menu">
                <button onClick={() => { void generateCandidates() }} disabled={busy}>
                  <PencilLine size={17} /> Generate all candidates
                </button>
                <button onClick={() => { void solveAllSingles() }} disabled={busy}>
                  <CheckCheck size={17} /> Solve all singles
                </button>
                <button aria-pressed={highlightCandidatePairs} onClick={() => {
                  setSelectedDigit(null)
                  setHighlightCandidatePairs((current) => !current)
                  setPuzzleMenuOpen(false)
                }}>
                  <Braces size={17} /> Highlight {'{x,y}'} cells
                </button>
                <div className="app-menu-separator" />
                <button onClick={() => { void runCheck() }} disabled={busy}>
                  <Check size={17} /> Check puzzle
                </button>
              </div>}
            </div>
          )}
        </div>
        <Board game={game} values={values} errors={errors} candidateLayout={advancedModes.candidateLayout}
          showGuides={appearance.showGuides}
          highlightedDigit={mode === 'color' ? null : selectedDigit} selected={selected} active={active}
          highlightCandidateCount={highlightCandidatePairs ? 2 : null}
          boardRef={boardRef} onCell={clickCell} />
        {draft && <div className="draft-tip"><PencilLine size={16} /> Enter the starting digits, then save your puzzle.</div>}
        {!draft && <div className="puzzle-footer">
          <span className="duration-counter" role="timer" aria-label={`Elapsed time ${formatTime(game.elapsed)}`}>
            {formatTime(game.elapsed)}
          </span>
        </div>}
      </section>
      <Controls mode={mode} pencil={pencil} togglePencil={() => { setEraseMode(false); setColorMode(false); setPencil((current) => !current) }}
        candidateKind={candidateKind} setCandidateKind={setCandidateKind} advancedModes={advancedModes}
        colorMode={colorMode} toggleColorMode={() => { setEraseMode(false); setPencil(false); setSelectedDigit(null); setColorMode((current) => !current) }}
        eraseMode={eraseMode} toggleEraseMode={() => {
          setColorMode(false); setPencil(false); setSelectedDigit(null); setSelected([]); setEraseMode((current) => !current)
        }}
        selectedDigit={selectedDigit} hasCellSelection={selected.length > 0}
        values={values} input={input}
        undo={() => edit(undo)} redo={() => edit(redo)} canUndo={!!game.past.length} canRedo={!!game.future.length}
        disabled={disabled} draft={draft} inputSize={inputSize} panelHeight={panelHeight}
        setPanelHeight={setPanelHeight} beginResize={beginResize} />
      {dialogResult && <Modal title={dialogResult.title} onClose={() => setDialogResult(null)} className="check-dialog">
        <div className={`check-result ${dialogResult.tone}`}>
          <span className="check-result-icon" aria-hidden="true">
            {dialogResult.tone === 'success' ? <CircleCheck size={30} />
              : dialogResult.tone === 'error' ? <CircleX size={30} /> : <Info size={30} />}
          </span>
          <p>{dialogResult.text}</p>
        </div>
      </Modal>}
    </>
  )
}
