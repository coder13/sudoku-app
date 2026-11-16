import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock3, Ellipsis, Pause, PencilLine, Play, Share2 } from 'lucide-react'
import { runEngine, type Analysis } from '../sudoku/engine'
import {
  COLORS, conflictsOf, enter, formatTime, isSolved, move, progressOf, redo, undo, valuesOf,
  type Game, type Mode,
} from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Controls, type Feedback } from './Controls'

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
}
const MODE_KEYS: Record<string, Mode> = { n: 'value', c: 'center', x: 'corner', b: 'color' }

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
  const [selected, setSelected] = useState([start])
  const [mode, setMode] = useState<Mode>('value')
  const [multi, setMulti] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const anchor = useRef(start)
  const boardRef = useRef<HTMLDivElement>(null)
  const values = useMemo(() => valuesOf(game), [game.givens, game.position.entries])
  const conflicts = useMemo(() => conflictsOf(values), [values])
  const draft = game.source === 'draft'
  const solved = isSolved(game)
  const disabled = !draft && game.paused
  const { filled, total } = progressOf(game)

  useTimer(game.id, !draft && !solved && !disabled && game.started && !modalOpen)

  function edit(transform: (current: Game) => Game) {
    if (disabled) return
    setFeedback(null)
    roomStore.update(game.id, transform)
  }

  function input(digit: number, inputMode = mode) {
    if (!selected.length || (inputMode === 'color' && digit > COLORS.length)) return
    edit((current) => enter(current, selected, inputMode, digit))
  }

  function clickCell(index: number, event: MouseEvent) {
    setActive(index)
    if (event.shiftKey) setSelected(rectangle(anchor.current, index))
    else {
      anchor.current = index
      setSelected((current) => (multi || event.metaKey || event.ctrlKey)
        ? current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
        : [index])
    }
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target
      if (disabled || modalOpen || event.altKey ||
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
      } else if (!draft && !shortcut && MODE_KEYS[key]) {
        event.preventDefault()
        setMode(MODE_KEYS[key])
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

  async function autoNotes() {
    setBusy(true)
    setFeedback(null)
    try {
      const notes = await runEngine({ type: 'notes', values })
      if (!notes) {
        setFeedback(validation.conflict)
        return
      }
      roomStore.update(game.id, (current) => current.position === game.position
        && notes.some((mask, i) => mask !== current.position.center[i])
        ? move(current, { ...current.position, center: notes })
        : current)
      setMode('center')
    } catch (error) {
      setFeedback({ text: (error as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="surface puzzle" aria-labelledby="puzzle-heading" id="current-puzzle">
        <div className="puzzle-heading">
          <div className="puzzle-name">
            <span className={`puzzle-kind ${draft ? 'is-draft' : ''}`}>{draft ? 'Puzzle editor' : 'Classic · 9 × 9'}</span>
            <h2 id="puzzle-heading">{game.title}</h2>
          </div>
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
            <button className="icon-button puzzle-icon" title="Puzzle options" aria-label="Puzzle options" onClick={onManage}><Ellipsis size={19} /></button>
          </div>
        </div>
        <Board game={game} values={values} conflicts={conflicts} selected={selected} active={active} boardRef={boardRef} onCell={clickCell} onResume={togglePause} />
        {draft ? (
          <div className="progress-area draft-tip"><PencilLine size={16} /> Enter the starting digits, then save your puzzle.</div>
        ) : (
          <div className="progress-area">
            <div className="progress-caption">
              <span>{solved ? <><Check size={16} /> Puzzle solved</> : 'Progress'}</span>
              <span>{filled} <span className="progress-of">/</span> {total} filled</span>
            </div>
            <progress className="progress-track" aria-label="Puzzle progress" max={total || 1} value={total ? filled : 1} />
          </div>
        )}
      </section>
      <Controls mode={mode} setMode={setMode} values={values} multi={multi} toggleMulti={() => setMulti(!multi)} input={input}
        undo={() => edit(undo)} redo={() => edit(redo)} canUndo={!!game.past.length} canRedo={!!game.future.length}
        check={runCheck} notes={autoNotes} disabled={disabled} busy={busy} draft={draft} feedback={feedback} />
    </>
  )
}
