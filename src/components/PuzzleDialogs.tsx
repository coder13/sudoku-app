import { Button, ChoiceButton } from './Button'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Bookmark, Clipboard, Link2, Trash2 } from 'lucide-react'
import { analyzeMini } from '../sudoku/mini-play'
import { runEngine } from '../sudoku/engine'
import { exportPuzzle, type ShareFormat } from '../sudoku/formats'
import { isSolved, makeGame, valuesOf, type Game } from '../sudoku/game'
import { publishSharedPuzzle, sharedPuzzleLink } from '../sudoku/puzzle-sharing'
import { roomStore } from '../sudoku/storage'
import { Modal } from './Modal'
import { SelectControl } from './SelectControl'
import { validation } from './PuzzleCheckResult'

function useMounted() {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return mounted
}

export function ManagePuzzle({ game, close }: {
  game: Game
  close: () => void
}) {
  const id = useId()

  function deletePuzzle() {
    const current = roomStore.getSnapshot().games.find((puzzle) => puzzle.id === game.id)
    if (current && current.source !== 'draft' && !isSolved(current)) {
      roomStore.stopPlaying(game.id)
      roomStore.remove(game.id)
    }
    close()
  }

  return <Modal title={game.title} onClose={close}>
    <div className="stop-puzzle-options">
      {!game.savedForLater && <ChoiceButton type="button" onClick={() => {
        roomStore.saveForLater(game.id)
        close()
      }}
        aria-labelledby={`${id}-save`} aria-describedby={`${id}-save-description`}>
        <span className="option-icon"><Bookmark size={20} aria-hidden="true" /></span>
        <span><strong id={`${id}-save`}>Save for later</strong>
          <small id={`${id}-save-description`}>Resume this puzzle later with your progress saved.</small></span>
      </ChoiceButton>}
      <ChoiceButton type="button" className="delete-puzzle-option" onClick={deletePuzzle}
        aria-labelledby={`${id}-delete`} aria-describedby={`${id}-delete-description`}>
        <span className="option-icon"><Trash2 size={20} aria-hidden="true" /></span>
        <span><strong id={`${id}-delete`}>Delete puzzle</strong>
          <small id={`${id}-delete-description`}>Remove the puzzle and its progress from Your puzzles.</small></span>
      </ChoiceButton>
    </div>
    <div className="dialog-actions stop-puzzle-footer">
      <Button type="button" onClick={close}>Cancel</Button>
    </div>
  </Modal>
}

const formats: ['link' | ShareFormat, string][] = [
  ['link', 'Puzzle link'],
  ['givens', '81-character givens'],
  ['grid', '9-line text grid'],
  ['hodoku', 'HoDoKu library line'],
  ['exchange', 'Sudoku Exchange link'],
  ['coach', 'sudoku.coach link'],
]

const miniFormats: ['link' | ShareFormat, string][] = [
  ['link', 'Puzzle link'], ['givens', '16-character givens'], ['grid', '4-line text grid'],
]

export function SharePuzzle({ game, close }: { game: Game; close: () => void }) {
  const { hostname, origin } = window.location
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname === '[::1]' || /^127(?:\.\d+){3}$/.test(hostname)
  const [format, setFormat] = useState<'link' | ShareFormat>('link')
  const [status, setStatus] = useState('')
  const [link, setLink] = useState('')
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')
  const text = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<AbortController | null>(null)
  const size = game.grid?.size ?? 9
  const value = format === 'link' ? link : exportPuzzle(game.givens, format, size)
  useEffect(() => () => pending.current?.abort(), [])

  async function createLink() {
    if (pending.current) return
    const request = new AbortController()
    pending.current = request
    setSharing(true)
    setError('')
    try {
      const id = await publishSharedPuzzle(game, request.signal)
      if (!request.signal.aborted) {
        setLink(sharedPuzzleLink(id, origin))
        setStatus('Link ready to copy.')
      }
    } catch (reason) {
      if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : 'The link could not be created.')
    } finally {
      pending.current = null
      if (!request.signal.aborted) setSharing(false)
    }
  }

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
        <p>Share {game.title} so someone else can solve it. Your progress stays private.</p>
        {!game.variant && <>
          <label htmlFor="share-format">Format</label>
          <SelectControl id="share-format" value={format} disabled={sharing} onChange={(event) => {
            setFormat(event.target.value as 'link' | ShareFormat)
            setStatus('')
            setError('')
          }}>
            {(game.grid ? miniFormats : formats).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </SelectControl>
        </>}
        {loopback && format === 'link' && <p>This link opens only on this device.</p>}
        {format === 'link' && <p>Anyone with the link can open the starting grid and rules.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {value && <>
          <label htmlFor="share-output">{format === 'link' ? 'Puzzle link' : 'Puzzle to share'}</label>
          <textarea id="share-output" ref={text} value={value} readOnly rows={format === 'grid' ? size : 3} spellCheck={false} />
        </>}
        <div className="dialog-actions spread">
          <span className="dialog-status" role="status">{status}</span>
          {value ? <Button variant="primary" onClick={copy}><Clipboard size={16} /> Copy</Button>
            : <Button variant="primary" onClick={createLink} disabled={sharing}><Link2 size={16} /> {sharing ? 'Creating link…' : 'Create link'}</Button>}
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
      const status = game.grid ? await analyzeMini(givens) : await runEngine({ type: 'analyze', values: givens })
      if (status !== 'unique') throw new Error(validation[status].text)
      if (!mounted.current) return
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || current.source !== 'draft' || valuesOf(current) !== givens) {
        throw new Error('The draft changed. Reopen this dialog to save the latest grid.')
      }
      if (game.editingId) {
        const original = roomStore.getSnapshot().games.find((item) => item.id === game.editingId)
        if (!original) throw new Error('The saved puzzle is no longer available.')
        roomStore.update(original.id, () => ({ ...makeGame(original.id, title.trim(), givens, 'custom', original.created, game.grid), saved: true }))
        roomStore.remove(game.id)
        roomStore.select(original.id)
      } else {
        roomStore.update(game.id, () => ({ ...makeGame(game.id, title.trim(), givens, 'custom', game.created, game.grid), saved: true }))
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
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>{busy ? 'Checking…' : 'Save and play'}</Button>
        </div>
      </form>
    </Modal>
  )
}
