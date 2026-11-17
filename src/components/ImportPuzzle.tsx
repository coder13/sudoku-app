import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, FileUp, Play } from 'lucide-react'
import { runEngine } from '../sudoku/engine'
import { createGameId, makeGame, puzzleIdentity, type Game } from '../sudoku/game'
import { detectPuzzle, MAX_IMPORT_LENGTH, type ImportedPuzzle } from '../sudoku/puzzle-import'
import { roomStore } from '../sudoku/storage'
import { VARIANTS } from '../sudoku/variants'
import { Board } from './Board'
import { Modal } from './Modal'
import { validation } from './PuzzleCheckResult'

function existingPuzzle({ givens, variant }: Pick<ImportedPuzzle, 'givens' | 'variant'>) {
  const identity = puzzleIdentity({ givens, variant })
  return roomStore.getSnapshot().games.find((game) => game.source !== 'draft' && puzzleIdentity(game) === identity)
}

export type PuzzlePreview = { game: Game; format: ImportedPuzzle['format'] }

async function preparePuzzle(input: string): Promise<PuzzlePreview> {
  const imported = await detectPuzzle(input)
  const { givens, variant, format } = imported
  const existing = existingPuzzle(imported)
  const name = variant ? `Imported ${VARIANTS[variant.id].name} puzzle` : 'Imported puzzle'
  const game = makeGame(createGameId(), name, givens, 'imported')
  if (!existing) {
    const status = variant
      ? await runEngine({ type: 'variant', operation: 'analyze', position: { puzzle: variant.puzzle } })
      : await runEngine({ type: 'analyze', values: givens })
    if (status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
    if (status !== 'unique') throw new Error(validation[status].text)
  }
  if (variant) {
    const solution = existing?.variant?.solution ??
      await runEngine({ type: 'variant', operation: 'solve', position: { puzzle: variant.puzzle } })
    game.variant = { ...variant, solution }
  }
  return { game, format }
}

function finishImport(game: Game, play: boolean) {
  const existing = existingPuzzle(game)
  if (existing) {
    if (play) roomStore.select(existing.id)
    return false
  }
  roomStore.add(play ? game : { ...game, savedForLater: true })
  return true
}

export async function openPuzzle(input: string, cancelled: () => boolean) {
  const { game } = await preparePuzzle(input)
  if (!cancelled()) finishImport(game, true)
}

export function ImportPuzzle({ close, onPlay, fullPage = false, onPreview = preparePuzzle }: {
  close: () => void
  onPlay: () => void
  fullPage?: boolean
  onPreview?: (input: string) => Promise<PuzzlePreview>
}) {
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const summary = useRef<HTMLParagraphElement>(null)
  const pending = useRef<AbortController | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<PuzzlePreview>()

  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (fullPage) {
      heading.current?.closest('main')?.scrollTo(0, 0)
      heading.current?.focus({ preventScroll: true })
    } else if (preview) summary.current?.focus({ preventScroll: true })
  }, [fullPage, preview])

  async function check(source: string | File) {
    if (pending.current) return
    const work = new AbortController()
    pending.current = work
    setBusy(true)
    setError('')
    setStatus('')
    try {
      if (typeof source !== 'string' && source.size > MAX_IMPORT_LENGTH) throw new Error('Choose a text file containing one puzzle.')
      const text = typeof source === 'string' ? source : await source.text()
      if (work.signal.aborted) return
      setInput(text)
      const result = await onPreview(text)
      if (!work.signal.aborted) setPreview(result)
    } catch (reason) {
      if (!work.signal.aborted) setError(reason instanceof Error ? reason.message : 'This puzzle could not be opened.')
    } finally {
      pending.current = null
      if (!work.signal.aborted) setBusy(false)
    }
  }

  function saveAndContinue(game: Game) {
    const added = finishImport(game, false)
    setPreview(undefined)
    setInput('')
    if (!added) setStatus('This puzzle is already in Your puzzles.')
    else if (!roomStore.getSnapshot().storageAvailable) setStatus('Puzzle available for this session. Local storage is unavailable.')
    else setStatus('Puzzle saved for later.')
  }

  const title = preview ? 'Preview puzzle' : 'Import puzzle'
  const content = preview ? (
    <div className="import-preview">
      <p className="import-preview-meta" ref={summary} tabIndex={-1}>
        <strong>{VARIANTS[preview.game.variant?.id ?? 'classic'].name}</strong>
        <span>{preview.format}</span>
      </p>
      <Board label="Puzzle preview" givens={preview.game.givens} values={preview.game.givens}
        variantPuzzle={preview.game.variant?.puzzle} showGuides={false} />
      <div className="dialog-actions import-preview-actions">
        <button type="button" className="button secondary import-edit" onClick={() => setPreview(undefined)}>Edit input</button>
        <button type="button" className="button secondary" onClick={() => saveAndContinue(preview.game)}>
          <Bookmark size={17} aria-hidden="true" /> Save and import another
        </button>
        <button type="button" className="button primary" onClick={() => { finishImport(preview.game, true); onPlay() }}>
          <Play size={17} aria-hidden="true" /> Start playing
        </button>
      </div>
    </div>
  ) : (
    <form className="dialog-form import-form" onSubmit={(event) => { event.preventDefault(); void check(input) }}>
      <p>Paste a puzzle code, link, or text grid. The app detects the format.</p>
      <label htmlFor={id}>Puzzle text or link</label>
      <textarea id={id} value={input} onChange={(event) => { setInput(event.target.value); setError(''); setStatus('') }}
        rows={5} placeholder="Paste a puzzle here" maxLength={MAX_IMPORT_LENGTH} spellCheck={false}
        autoCapitalize="off" autoFocus={!fullPage} required disabled={busy} />
      {error && <p className="form-error" role="alert">{error}</p>}
      {status && <p className="dialog-status" role="status">{status}</p>}
      <div className="dialog-actions spread">
        <label className="button secondary file-picker"><FileUp size={17} aria-hidden="true" /> Open text file
          <input type="file" accept=".txt,.sdk,.sdm,.hkl,.json,text/plain,application/json" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void check(file)
          }} />
        </label>
        <button type="submit" className="button primary" disabled={busy || !input.trim()}>{busy ? 'Checking puzzle…' : 'Preview puzzle'}</button>
      </div>
    </form>
  )

  if (fullPage) return (
    <main className="puzzles-page puzzles-subscreen import-page" aria-labelledby={`${id}-heading`}>
      <header className="puzzles-page-heading">
        <button type="button" className="icon-button puzzles-back" aria-label={preview ? 'Back to puzzle input' : 'Leave puzzle import'}
          onClick={preview ? () => setPreview(undefined) : close}><ArrowLeft size={21} /></button>
        <h1 id={`${id}-heading`} ref={heading} tabIndex={-1}>{title}</h1>
      </header>
      {content}
    </main>
  )

  return <Modal title={title} onClose={close} className="import-dialog">{content}</Modal>
}
