import { Button, ChoiceButton } from './Button'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Bookmark, Clipboard, Trash2 } from 'lucide-react'
import { analyzeMini } from '../sudoku/mini-play'
import { runEngine } from '../sudoku/engine'
import { algebraicLabel, connectedCage, isAlgebraicCageList, parseAlgebraicTotal, type AlgebraicCage } from '../sudoku/algebraic-cages'
import { verifyAlgebraicPuzzle } from '../sudoku/algebraic-game'
import { exportPuzzle, puzzlePlayLink, type ShareFormat } from '../sudoku/formats'
import { isSolved, makeGame, move, valuesOf, type Game } from '../sudoku/game'
import { MINI_GRID } from '../sudoku/grid'
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

const formats: [ShareFormat, string][] = [
  ['link', 'Puzzle link'],
  ['givens', '81-character givens'],
  ['grid', '9-line text grid'],
  ['hodoku', 'HoDoKu library line'],
  ['exchange', 'Sudoku Exchange link'],
  ['coach', 'sudoku.coach link'],
]

const miniFormats: [ShareFormat, string][] = [
  ['link', 'Puzzle link'], ['givens', '16-character givens'], ['grid', '4-line text grid'],
]

export function SharePuzzle({ game, close }: { game: Game; close: () => void }) {
  const { hostname, origin } = window.location
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname === '[::1]' || /^127(?:\.\d+){3}$/.test(hostname)
  const [format, setFormat] = useState<ShareFormat>(loopback && !game.variant && !game.grid ? 'exchange' : 'link')
  const [status, setStatus] = useState('')
  const text = useRef<HTMLTextAreaElement>(null)
  const size = game.grid?.size ?? 9
  const value = game.variant || format === 'link' ? puzzlePlayLink(game, origin) : exportPuzzle(game.givens, format, origin, size)

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
        <p>Share the starting grid for {game.title}. Anyone who opens the link without access to your solve starts their own.</p>
        {!game.variant && !game.algebraic && <>
          <label htmlFor="share-format">Format</label>
          <SelectControl id="share-format" value={format} onChange={(event) => { setFormat(event.target.value as ShareFormat); setStatus('') }}>
            {(game.grid ? miniFormats : formats).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </SelectControl>
        </>}
        {loopback && format === 'link' && <p>This link opens only on this device.</p>}
        <label htmlFor="share-output">Puzzle to share</label>
        <textarea id="share-output" ref={text} value={value} readOnly rows={format === 'grid' ? size : 3} spellCheck={false} />
        <div className="dialog-actions spread">
          <span className="dialog-status" role="status">{status}</span>
          <Button variant="primary" onClick={copy}><Clipboard size={16} /> Copy</Button>
        </div>
      </div>
    </Modal>
  )
}

export function EditCages({ game, close }: { game: Game; close: () => void }) {
  const [rules] = useState(game.position.draftCages ?? [])
  const [editing, setEditing] = useState(-1)
  const [label, setLabel] = useState('')
  const [cells, setCells] = useState<readonly number[]>([])
  const [error, setError] = useState('')
  const id = useId()
  const { size } = MINI_GRID
  const cellName = (cell: number) => `R${Math.floor(cell / size) + 1}C${cell % size + 1}`
  const occupied = new Set(rules.flatMap((rule, index) => index === editing ? [] : rule.cells))

  function select(index: number) {
    setEditing(index)
    setLabel(rules[index]?.label ?? '')
    setCells(rules[index]?.cells ?? [])
    setError('')
  }

  function update(next: readonly AlgebraicCage[]) {
    let changed = false
    roomStore.update(game.id, current => {
      if (current.source !== 'draft' || JSON.stringify(current.position.draftCages) !== JSON.stringify(rules)) return current
      changed = true
      return move(current, { ...current.position, draftCages: next })
    })
    if (changed) close()
    else setError('The draft changed. Reopen Edit cages to see the latest cages.')
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const total = parseAlgebraicTotal(label.trim().replace(/\s*([+−-])\s*/, (_, sign) => sign === '−' ? '-' : sign))
    if (!total) { setError('Enter a total such as 7, x, x+1, or x−5.'); return }
    if (cells.length > size || !connectedCage(cells)) {
      setError('Select one to four cells connected by shared edges.')
      return
    }
    const cage: AlgebraicCage = { type: 'algebraic-cage', cells: [...cells].sort((a, b) => a - b), label: algebraicLabel(total), total }
    const next = [...rules]
    if (editing < 0) next.push(cage)
    else next[editing] = cage
    if (!isAlgebraicCageList(next, { draft: true })) { setError('Each cell can belong to only one cage.'); return }
    update(next)
  }

  return <Modal title="Edit cages" onClose={close}>
    <form className="dialog-form" onSubmit={save}>
      <label htmlFor={`${id}-cage`}>Cage</label>
      <SelectControl id={`${id}-cage`} value={editing} onChange={event => select(Number(event.currentTarget.value))}>
        <option value={-1}>New cage</option>
        {rules.map((rule, index) => <option key={rule.cells[0]} value={index}>{rule.label} · {rule.cells.map(cellName).join(', ')}</option>)}
      </SelectControl>
      <label htmlFor={`${id}-label`}>Cage total</label>
      <input id={`${id}-label`} value={label} onChange={event => { setLabel(event.currentTarget.value); setError('') }} maxLength={46} />
      <p>Use a whole number or a letter with an optional offset, such as x−5. Each letter has the same positive integer value in all its cages.</p>
      <fieldset className="cage-editor-cells">
        <legend>Cells</legend>
        {Array.from({ length: size ** 2 }, (_, cell) => <Button key={cell} type="button" aria-pressed={cells.includes(cell)}
          disabled={occupied.has(cell)} onClick={() => {
            setCells(current => current.includes(cell) ? current.filter(value => value !== cell) : [...current, cell])
            setError('')
          }}>{cellName(cell)}</Button>)}
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="dialog-actions spread">
        {editing >= 0 && <Button type="button" variant="danger" onClick={() => update(rules.filter((_, index) => index !== editing))}>Remove cage</Button>}
        <Button type="submit" variant="primary">Save cage</Button>
      </div>
    </form>
  </Modal>
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
    const rules = game.position.draftCages
    try {
      if (rules && !isAlgebraicCageList(rules)) throw new Error('Add at least one cage with a letter before saving.')
      const algebraic = rules ? await verifyAlgebraicPuzzle({ givens, rules }) : undefined
      if (!algebraic) {
        const status = game.grid ? await analyzeMini(givens) : await runEngine({ type: 'analyze', values: givens })
        if (status !== 'unique') throw new Error(validation[status].text)
      }
      if (!mounted.current) return
      const current = roomStore.getSnapshot().games.find((item) => item.id === game.id)
      if (!current || current.source !== 'draft' || valuesOf(current) !== givens ||
        JSON.stringify(current.position.draftCages) !== JSON.stringify(rules)) {
        throw new Error('The draft changed. Reopen this dialog to save the latest grid.')
      }
      const saveGame = (id: string, created: number) => ({
        ...makeGame(id, title.trim(), givens, 'custom', created, game.grid), saved: true, ...(algebraic && { algebraic }),
      })
      if (game.editingId) {
        const original = roomStore.getSnapshot().games.find((item) => item.id === game.editingId)
        if (!original) throw new Error('The saved puzzle is no longer available.')
        roomStore.update(original.id, () => saveGame(original.id, original.created))
        roomStore.remove(game.id)
        roomStore.select(original.id)
      } else {
        roomStore.update(game.id, () => saveGame(game.id, game.created))
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
