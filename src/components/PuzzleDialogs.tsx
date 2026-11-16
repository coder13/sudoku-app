import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Clipboard, Dices, FileUp, PencilLine } from 'lucide-react'
import { DIFFICULTY_OPTIONS, difficultyOptionLabel, isDifficultyPreference, type DifficultyPreference } from '../sudoku/difficulty'
import { runEngine } from '../sudoku/engine'
import { exportPuzzle, parsePuzzle, type ShareFormat } from '../sudoku/formats'
import { createGameId, makeGame, valuesOf, type Game } from '../sudoku/game'
import { isPlayablePuzzle, VARIANTS, type VariantGame, type VariantId } from '../sudoku/variants'
import { VariantSelector } from './VariantSelector'
import { roomStore } from '../sudoku/storage'
import { Modal } from './Modal'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'
import { validation } from './PuzzleCheckResult'

export async function openPuzzle(input: string, cancelled: () => boolean) {
  const url = URL.canParse(input.trim()) ? new URL(input.trim()) : undefined
  if (url?.hash.startsWith('#variant=')) {
    let shared: Pick<VariantGame, 'id' | 'puzzle'>
    try {
      if (url.hash.length > 20_000) throw new Error()
      shared = JSON.parse(new URLSearchParams(url.hash.slice(1)).get('variant') ?? '')
      if (!isPlayablePuzzle(shared?.id, shared?.puzzle)) throw new Error()
    } catch {
      throw new Error('This link is missing a valid Sudoku variant.')
    }
    const { id, puzzle } = shared
    const existing = () => roomStore.getSnapshot().games.find((game) =>
      game.variant?.id === id && JSON.stringify(game.variant.puzzle) === JSON.stringify(puzzle))
    const game = existing()
    if (!game) {
      const position = { puzzle }
      const status = await runEngine({ type: 'variant', operation: 'analyze', position })
      if (status !== 'unique') throw new Error(validation[status].text)
      const solution = await runEngine({ type: 'variant', operation: 'solve', position })
      if (cancelled()) return
      const added = existing()
      if (added) roomStore.select(added.id)
      else roomStore.add({
        ...makeGame(createGameId(), `Imported ${VARIANTS[id].name} puzzle`, puzzle.givens, 'imported'),
        variant: { id, puzzle, solution },
      })
      return
    }
    if (!cancelled()) roomStore.select(game.id)
    return
  }

  const givens = parsePuzzle(input)

  const existing = roomStore.getSnapshot().games.find((game) => !game.variant && game.givens === givens && game.source !== 'draft')
  if (existing) {
    if (!cancelled()) roomStore.select(existing.id)
    return
  }
  const status = await runEngine({ type: 'analyze', values: givens })
  if (status !== 'unique') throw new Error(validation[status].text)
  if (cancelled()) return
  const current = roomStore.getSnapshot().games.find((game) => !game.variant && game.givens === givens && game.source !== 'draft')
  if (current) roomStore.select(current.id)
  else roomStore.add(makeGame(createGameId(), 'Imported puzzle', givens, 'imported'))
}
function useMounted() {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return mounted
}

export function NewPuzzle({ close, difficulty, onDifficultyChange, onCreate }: {
  close: () => void
  difficulty: DifficultyPreference
  onDifficultyChange: (difficulty: DifficultyPreference) => void
  onCreate: () => void
}) {
  const { busy, error, generate } = usePuzzleGeneration()
  const { recommended } = usePlayerRating()
  const [variant, setVariant] = useState<VariantId>('classic')
  const [selection, setSelection] = useState<DifficultyPreference | null>(null)
  const selected = selection ?? difficulty

  function submit(event: FormEvent) {
    event.preventDefault()
    void generate(selected, () => {
      onDifficultyChange(selected)
      close()
    }, variant)
  }

  return (
    <Modal title="New puzzle" onClose={close}>
      <form className="dialog-form" onSubmit={submit}>
        <VariantSelector value={variant} onChange={setVariant} busy={busy} />
        <label htmlFor="puzzle-difficulty">Difficulty</label>
        <select id="puzzle-difficulty" value={selected} disabled={busy} onChange={(event) => {
          const next = event.target.value
          if (isDifficultyPreference(next)) setSelection(next)
        }}>
          {DIFFICULTY_OPTIONS.map((level) => <option key={level} value={level}>{difficultyOptionLabel(level, recommended)}</option>)}
        </select>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button primary" disabled={busy}>
          <Dices size={18} /> {busy ? 'Generating…' : 'Generate a puzzle'}
        </button>
      </form>
      <div className="new-options">
        <button className="new-option" disabled={busy} onClick={() => {
          onCreate()
          close()
        }}>
          <span className="option-icon"><PencilLine size={21} /></span>
          <span><strong>Create by hand</strong><small>Enter your own givens on a blank grid.</small></span>
        </button>
      </div>
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
  const [format, setFormat] = useState<ShareFormat>(loopback && !game.variant ? 'exchange' : 'link')
  const [status, setStatus] = useState('')
  const text = useRef<HTMLTextAreaElement>(null)
  const value = game.variant
    ? `${origin}/#variant=${encodeURIComponent(JSON.stringify({ id: game.variant.id, puzzle: game.variant.puzzle }))}`
    : exportPuzzle(game.givens, format, origin)

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
        {!game.variant && <>
          <label htmlFor="share-format">Format</label>
          <select id="share-format" value={format} onChange={(event) => { setFormat(event.target.value as ShareFormat); setStatus('') }}>
            {formats.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </>}
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
      if (game.editingId) {
        const original = roomStore.getSnapshot().games.find((item) => item.id === game.editingId)
        if (!original) throw new Error('The saved puzzle is no longer available.')
        roomStore.update(original.id, () => ({ ...makeGame(original.id, title.trim(), givens, 'custom', original.created), saved: true }))
        roomStore.remove(game.id)
        roomStore.select(original.id)
      } else {
        roomStore.update(game.id, () => ({ ...makeGame(game.id, title.trim(), givens, 'custom', game.created), saved: true }))
      }
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
