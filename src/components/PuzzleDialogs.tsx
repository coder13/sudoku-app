import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Clipboard, Dices, FileUp, PencilLine } from 'lucide-react'
import { runEngine } from '../sudoku/engine'
import { exportPuzzle, type ShareFormat } from '../sudoku/formats'
import { EMPTY, makeGame, valuesOf, type Game } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { Modal } from './Modal'
import { validation } from './Worktable'

export async function openPuzzle(givens: string, cancelled: () => boolean) {
  const existing = roomStore.getSnapshot().games.find((game) => game.givens === givens && game.source !== 'draft')
  if (existing) {
    if (!cancelled()) roomStore.select(existing.id)
    return
  }
  const status = await runEngine({ type: 'analyze', values: givens })
  if (status !== 'unique') throw new Error(validation[status].text)
  if (cancelled()) return
  const current = roomStore.getSnapshot().games.find((game) => game.givens === givens && game.source !== 'draft')
  if (current) roomStore.select(current.id)
  else roomStore.add(makeGame(crypto.randomUUID(), 'Imported puzzle', givens, 'imported'))
}

function useMounted() {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return mounted
}

export function NewPuzzle({ close }: { close: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useMounted()

  async function generate() {
    setBusy(true)
    setError('')
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const puzzle = await runEngine({ type: 'generate', seed })
      if (!mounted.current) return
      const used = new Set(roomStore.getSnapshot().games.map((game) => game.title))
      let n = 1
      while (used.has(`Puzzle ${n}`)) n++
      roomStore.add(makeGame(crypto.randomUUID(), `Puzzle ${n}`, puzzle, 'generated'))
      close()
    } catch (reason) {
      setError((reason as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="New puzzle" onClose={close}>
      <div className="new-options">
        <button className="new-option" disabled={busy} onClick={generate}>
          <span className="option-icon"><Dices size={22} /></span>
          <span><strong>{busy ? 'Generating…' : 'Generate a puzzle'}</strong><small>Start a fresh classic Sudoku.</small></span>
        </button>
        <button className="new-option" disabled={busy} onClick={() => {
          roomStore.add(makeGame(crypto.randomUUID(), 'Untitled puzzle', EMPTY, 'draft'))
          close()
        }}>
          <span className="option-icon"><PencilLine size={21} /></span>
          <span><strong>Create by hand</strong><small>Enter your own givens on a blank grid.</small></span>
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export function ImportPuzzle({ close, onImport }: { close: () => void; onImport: (input: string, cancelled: () => boolean) => Promise<void> }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useMounted()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await onImport(input, () => !mounted.current)
      if (mounted.current) close()
    } catch (reason) {
      setError((reason as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Import puzzle" onClose={close}>
      <form className="dialog-form" onSubmit={submit}>
        <p>Paste an 81-character puzzle, a HoDoKu library line, or a classic Sudoku Exchange or sudoku.coach link.</p>
        <label htmlFor="import-text">Puzzle text or link</label>
        <textarea id="import-text" value={input} onChange={(event) => setInput(event.target.value)} rows={4}
          placeholder="Use . or 0 for empty cells" maxLength={10_000} spellCheck={false} autoCapitalize="off" autoFocus required />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions spread">
          <label className="button secondary file-picker"><FileUp size={17} /> Open text file
            <input type="file" accept=".txt,.sdk,.sdm,.hkl,text/plain" disabled={busy} onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              if (file.size > 10_000) { setError('Choose a text file containing one puzzle.'); return }
              try { setInput(await file.text()); setError('') }
              catch { setError('This file couldn’t be read.') }
            }} />
          </label>
          <button type="submit" className="button primary" disabled={busy || !input.trim()}>{busy ? 'Checking…' : 'Import puzzle'}</button>
        </div>
      </form>
    </Modal>
  )
}

const formats: [ShareFormat, string][] = [
  ['link', 'Puzzle link'],
  ['givens', '81-character givens'],
  ['grid', '9-line text grid'],
  ['hodoku', 'HoDoKu library line'],
  ['exchange', 'Sudoku Exchange link'],
  ['coach', 'sudoku.coach link'],
]

export function SharePuzzle({ game, close }: { game: Game; close: () => void }) {
  const { hostname, origin } = window.location
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname === '[::1]' || /^127(?:\.\d+){3}$/.test(hostname)
  const [format, setFormat] = useState<ShareFormat>(loopback ? 'exchange' : 'link')
  const [status, setStatus] = useState('')
  const text = useRef<HTMLTextAreaElement>(null)
  const value = exportPuzzle(game.givens, format, origin)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setStatus('Copied to clipboard.')
    } catch {
      text.current?.select()
      setStatus('Text selected. Use your device’s Copy command.')
    }
  }

  return (
    <Modal title="Share puzzle" onClose={close}>
      <div className="dialog-form">
        <p>Share the starting grid for {game.title}.</p>
        <label htmlFor="share-format">Format</label>
        <select id="share-format" value={format} onChange={(event) => { setFormat(event.target.value as ShareFormat); setStatus('') }}>
          {formats.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {loopback && format === 'link' && <p>This link opens only on this device.</p>}
        <label htmlFor="share-output">Puzzle to share</label>
        <textarea id="share-output" ref={text} value={value} readOnly rows={format === 'grid' ? 9 : 3} spellCheck={false} />
        <div className="dialog-actions spread">
          <span className="dialog-status" role="status">{status}</span>
          <button className="button primary" onClick={copy}><Clipboard size={16} /> Copy</button>
        </div>
      </div>
    </Modal>
  )
}

export function SavePuzzle({ game, close }: { game: Game; close: () => void }) {
  const [title, setTitle] = useState(game.title === 'Untitled puzzle' ? '' : game.title)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useMounted()

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !title.trim()) return
    setError('')
    setBusy(true)
    const givens = valuesOf(game)
    try {
      const status = await runEngine({ type: 'analyze', values: givens })
      if (status !== 'unique') throw new Error(validation[status].text)
      if (!mounted.current) return
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || current.source !== 'draft' || valuesOf(current) !== givens) {
        throw new Error('The draft changed. Reopen this dialog to save the latest grid.')
      }
      roomStore.update(game.id, () => makeGame(game.id, title.trim(), givens, 'custom', game.created))
      close()
    } catch (reason) {
      setError((reason as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Save puzzle" onClose={close}>
      <form className="dialog-form" onSubmit={save}>
        <label htmlFor="draft-name">Puzzle name</label>
        <input id="draft-name" value={title} maxLength={72} onChange={(event) => setTitle(event.target.value)} autoFocus required placeholder="Name your puzzle" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="submit" className="button primary" disabled={busy || !title.trim()}>{busy ? 'Checking…' : 'Save and play'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function PuzzleOptions({ game, close, onSwitch, onShortcuts }: {
  game: Game
  close: () => void
  onSwitch?: () => void
  onShortcuts: () => void
}) {
  const [title, setTitle] = useState(game.title)
  const [confirm, setConfirm] = useState<'remove' | 'restart' | null>(null)
  const draft = game.source === 'draft'
  function rename(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    roomStore.update(game.id, (current) => ({ ...current, title: title.trim() }))
    close()
  }

  return (
    <Modal title="Puzzle options" onClose={close}>
      {confirm ? (
        <div className="dialog-form">
          <p>{confirm === 'remove' ? `Remove “${game.title}” and its saved progress?` : 'Restart from the original givens? This clears your entries, notes, and timer.'}</p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setConfirm(null)}>Back</button>
            <button className="button danger" onClick={() => {
              if (confirm === 'remove') roomStore.remove(game.id)
              else roomStore.update(game.id, (current) => makeGame(current.id, current.title, current.givens, current.source, current.created))
              close()
            }}>{confirm === 'remove' ? 'Remove puzzle' : 'Restart puzzle'}</button>
          </div>
        </div>
      ) : (
        <>
          <form className="dialog-form" onSubmit={rename}>
            <label htmlFor="puzzle-name-input">Puzzle name</label>
            <input id="puzzle-name-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={72} required />
            <div className="dialog-actions"><button type="submit" className="button primary" disabled={!title.trim() || title.trim() === game.title}>Save name</button></div>
          </form>
          <div className="manage-actions">
            {onSwitch && <button className="button secondary" onClick={onSwitch}>Switch puzzle</button>}
            <button className="button secondary" onClick={onShortcuts}>Keyboard shortcuts</button>
            {!draft && <button className="button secondary" onClick={() => setConfirm('restart')}>Restart puzzle</button>}
            <button className="button quiet remove-action" onClick={() => setConfirm('remove')}>Remove puzzle</button>
          </div>
        </>
      )}
    </Modal>
  )
}

const keys = [
  ['Move through the grid', '←', '↑', '↓', '→'],
  ['Select a rectangle', 'Shift', 'Click/Arrow'],
  ['Toggle individual cells', 'Ctrl/⌘', 'Click'],
  ['Enter a digit or note', '1–9'],
  ['Filled number mode', 'N'],
  ['Toggle pencil mode', 'P', 'or', 'C'],
  ['Toggle Color tab (when enabled)', 'B'],
  ['Erase', 'Backspace'],
  ['Undo', 'Ctrl/⌘', 'Z'],
  ['Redo', 'Ctrl/⌘', 'Shift', 'Z'],
]

export function Shortcuts({ close }: { close: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={close}>
      <dl className="shortcuts">
        {keys.map(([label, ...commands]) => (
          <div key={label}><dt>{label}</dt><dd>{commands.map((key) => <kbd key={key}>{key}</kbd>)}</dd></div>
        ))}
      </dl>
    </Modal>
  )
}
