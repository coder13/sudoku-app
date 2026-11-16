import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock3, Pause, PencilLine, Play, Share2 } from 'lucide-react'
import { runEngine, type Analysis } from '../sudoku/engine'
import {
  COLORS, conflictsOf, enter, formatTime, isSolved, redo, undo, valuesOf,
  type CandidateLayout, type ErrorMode, type Game, type Mode,
} from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Controls, type Feedback } from './Controls'

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
}
const ERROR_MODE_KEY = 'sudoku-app:v1:error-mode'
const ADVANCED_MODE_KEY = 'sudoku-app:v1:advanced-modes'
const ERROR_MODES = new Set<ErrorMode>(['all', 'incorrect', 'none'])
type AdvancedModes = { candidateLayout: CandidateLayout; colorsEnabled: boolean; multiSelectButton: boolean }
const DEFAULT_ADVANCED_MODES: AdvancedModes = { candidateLayout: 'grid', colorsEnabled: false, multiSelectButton: false }

export const validation: Record<Analysis, Feedback> = {
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
    function visibility() {
      if (document.visibilityState === 'hidden') {
        tick()
        started = null
      } else {
        started = performance.now()
      }
    }
    const timer = window.setInterval(tick, 500)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', tick)
    return () => {
      tick()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', tick)
    }
  }, [id, running])
}

export function Worktable({ game, modalOpen, onShare, onManage, onPublish }: {
  game: Game
  modalOpen: boolean
  onShare: () => void
  onManage: () => void
  onPublish: () => void
}) {
  const start = game.givens[40] === '0' ? 40 : Math.max(0, game.givens.indexOf('0'))
  const [active, setActive] = useState(start)
  const [selected, setSelected] = useState<number[]>([])
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null)
  const [pencil, setPencil] = useState(false)
  const [candidateKind, setCandidateKind] = useState<'center' | 'corner'>('corner')
  const [colorMode, setColorMode] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advancedModes, setAdvancedModesState] = useState<AdvancedModes>(DEFAULT_ADVANCED_MODES)
  const [errorMode, setErrorModeState] = useState<ErrorMode>('all')
  const [solution, setSolution] = useState<string | null>(null)
  const [multi, setMulti] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const anchor = useRef(start)
  const boardRef = useRef<HTMLDivElement>(null)
  const values = useMemo(() => valuesOf(game), [game.givens, game.position.entries])
  const conflicts = useMemo(() => conflictsOf(values), [values])
  const draft = game.source === 'draft'
  const mode: Mode = draft ? 'value' : colorMode ? 'color' : pencil
    ? advancedModes.candidateLayout === 'grid' ? 'candidate' : candidateKind
    : 'value'
  const solved = isSolved(game)
  const disabled = !draft && game.paused
  useTimer(game.id, !draft && !solved && !disabled && game.started && !modalOpen && !advancedOpen)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ERROR_MODE_KEY) as ErrorMode | null
      if (saved && ERROR_MODES.has(saved)) setErrorModeState(saved)
      const advanced = JSON.parse(localStorage.getItem(ADVANCED_MODE_KEY) ?? 'null') as Partial<AdvancedModes> | null
      if (advanced && (advanced.candidateLayout === 'grid' || advanced.candidateLayout === 'center-corner')) {
        setAdvancedModesState({
          candidateLayout: advanced.candidateLayout,
          colorsEnabled: advanced.colorsEnabled === true,
          multiSelectButton: advanced.multiSelectButton === true,
        })
      }
    } catch { /* Keep the default when preferences cannot be read. */ }
  }, [])

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

  function setErrorMode(next: ErrorMode) {
    setErrorModeState(next)
    try { localStorage.setItem(ERROR_MODE_KEY, next) }
    catch { /* The setting remains active for this session. */ }
  }

  function setAdvancedModes(next: AdvancedModes) {
    setAdvancedModesState(next)
    if (!next.colorsEnabled) {
      setColorMode(false)
      setSelectedDigit(null)
    }
    try { localStorage.setItem(ADVANCED_MODE_KEY, JSON.stringify(next)) }
    catch { /* The settings remain active for this session. */ }
  }

  function edit(transform: (current: Game) => Game) {
    if (disabled) return
    setFeedback(null)
    roomStore.update(game.id, transform)
  }

  function input(digit: number, inputMode = mode) {
    if (inputMode === 'color' && digit > COLORS.length) return
    if (!selected.length) {
      setSelectedDigit((current) => digit === 0 || current === digit ? null : digit)
      return
    }
    edit((current) => enter(current, selected, inputMode, digit))
  }

  function clickCell(index: number, event: MouseEvent) {
    setActive(index)
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
      if (disabled || modalOpen || advancedOpen || event.altKey ||
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
        setPencil(false)
        setColorMode(false)
      } else if (!draft && !shortcut && (key === 'c' || key === 'p')) {
        event.preventDefault()
        setColorMode(false)
        setPencil((current) => !current)
      } else if (!draft && !shortcut && key === 'b' && advancedModes.colorsEnabled) {
        event.preventDefault()
        setPencil(false)
        setSelectedDigit(null)
        setColorMode((current) => !current)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  function togglePause() {
    roomStore.update(game.id, (current) => ({ ...current, paused: !current.paused, started: true }))
  }

  async function runCheck() {
    setBusy(true)
    setFeedback(null)
    try {
      const status = await runEngine({ type: 'analyze', values })
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || valuesOf(current) !== values) return
      if (!draft && status === 'unique') {
        setFeedback({ text: solved ? 'Puzzle solved!' : 'Your entries are on track.', tone: 'success' })
      } else {
        setFeedback(validation[status])
      }
    } catch (error) {
      setFeedback({ text: (error as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="surface puzzle" aria-label={game.title}>
        <div className="puzzle-actions">
          {draft ? (
            <button className="button primary publish-button" onClick={onPublish}><Check size={17} /> Save puzzle</button>
          ) : (
            <>
              <button className="timer" onClick={togglePause} disabled={solved} aria-label={game.paused ? 'Resume timer' : 'Pause timer'} title={game.paused ? 'Resume timer' : 'Pause timer'}>
                <Clock3 size={16} className="timer-clock" /><span>{formatTime(game.elapsed)}</span>{game.paused ? <Play size={13} /> : <Pause size={13} />}
              </button>
              <button className="icon-button puzzle-icon" title="Share puzzle" aria-label="Share puzzle" onClick={onShare}><Share2 size={18} /></button>
            </>
          )}
        </div>
        <Board game={game} values={values} errors={errors} candidateLayout={advancedModes.candidateLayout}
          highlightedDigit={mode === 'color' ? null : selectedDigit} selected={selected} active={active}
          boardRef={boardRef} onCell={clickCell} onResume={togglePause} />
        {draft && <div className="draft-tip"><PencilLine size={16} /> Enter the starting digits, then save your puzzle.</div>}
      </section>
      <Controls mode={mode} pencil={pencil} togglePencil={() => { setColorMode(false); setPencil((current) => !current) }}
        candidateKind={candidateKind} setCandidateKind={setCandidateKind} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
        advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen}
        colorMode={colorMode} toggleColorMode={() => { setPencil(false); setSelectedDigit(null); setColorMode((current) => !current) }}
        selectedDigit={selectedDigit} hasCellSelection={selected.length > 0}
        errorMode={errorMode} setErrorMode={setErrorMode} values={values} multi={multi} toggleMulti={() => setMulti(!multi)} input={input}
        manage={onManage}
        undo={() => edit(undo)} redo={() => edit(redo)} canUndo={!!game.past.length} canRedo={!!game.future.length}
        check={runCheck} disabled={disabled} busy={busy} draft={draft} feedback={feedback} />
    </>
  )
}
