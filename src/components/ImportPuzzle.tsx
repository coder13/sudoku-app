import { Button, IconButton, buttonClassName } from './Button'
import { type ClipboardEvent, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, Camera, FileUp, ImageUp, Play } from 'lucide-react'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { deviceSync } from '../sudoku/device-sync'
import type { Game } from '../sudoku/game'
import { sixRuleDescriptions } from '../sudoku/six-game'
import { algebraicRules } from '../sudoku/algebraic-play'
import { PHOTO_TYPES } from '../sudoku/photo-image'
import { MAX_IMPORT_LENGTH } from '../sudoku/puzzle-import'
import { findImportedPuzzle, prepareImportedPuzzle, type PuzzlePreview } from '../sudoku/puzzle-preview'
import { applyPuzzleGrade } from '../sudoku/puzzle-rating'
import { findSharedAttempt } from '../sudoku/puzzle-sharing'
import { roomStore } from '../sudoku/storage'
import { variantName, variantRuleDescriptions } from '../sudoku/variants'
import { MINI_RULE } from '../sudoku/new-puzzle'
import { Board } from './Board'
import { Modal } from './Modal'
import { PhotoPuzzleReview } from './PhotoPuzzleReview'
import { PuzzleCamera } from './PuzzleCamera'
export type { PuzzlePreview } from '../sudoku/puzzle-preview'

function existingPuzzle(game: Pick<Game, 'givens' | 'variant' | 'algebraic' | 'grid' | 'six' | 'sharedPuzzleId'>) {
  const { games } = roomStore.getSnapshot()
  return game.sharedPuzzleId ? findSharedAttempt(games, game.sharedPuzzleId) : findImportedPuzzle(games, game)
}

function preparePuzzle(input: string): Promise<PuzzlePreview> {
  return prepareImportedPuzzle(input, roomStore.getSnapshot().games)
}

export function finishImport({ game, grade }: PuzzlePreview, play: boolean) {
  const existing = existingPuzzle(game)
  if (existing) {
    if (grade !== undefined && (existing.difficulty === undefined || existing.score === undefined)) {
      roomStore.update(existing.id, current => applyPuzzleGrade(current, grade))
    }
    if (play) roomStore.select(existing.id)
    return false
  }
  const copy = game.sharedPuzzleId && deviceSync.credentials() ? { ...game, saved: true } : game
  roomStore.add(play ? copy : { ...copy, savedForLater: true })
  return true
}

export async function openPuzzle(input: string, cancelled: () => boolean, { freshCopy = false }: { freshCopy?: boolean } = {}) {
  const preview = await preparePuzzle(input)
  if (cancelled()) return
  if (freshCopy) roomStore.add(preview.game)
  else finishImport(preview, true)
}

export function ImportPuzzle({ close, onPlay, fullPage = false, onPreview = preparePuzzle }: {
  close: () => void
  onPlay?: () => void
  fullPage?: boolean
  onPreview?: (input: string) => Promise<PuzzlePreview>
}) {
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const summary = useRef<HTMLParagraphElement>(null)
  const nativeCamera = useRef<HTMLInputElement>(null)
  const pending = useRef<AbortController | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<PuzzlePreview>()
  const [photo, setPhoto] = useState<Blob>()
  const [cameraOpen, setCameraOpen] = useState(false)
  const title = preview ? 'Preview puzzle' : photo ? 'Confirm image' : cameraOpen ? 'Photograph puzzle' : 'Import puzzle'

  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (fullPage) {
      heading.current?.closest('main')?.scrollTo(0, 0)
      heading.current?.focus({ preventScroll: true })
    } else if (preview) summary.current?.focus({ preventScroll: true })
  }, [fullPage, preview, title])

  async function check(source: string | File, fromPhoto = false) {
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
      if (!fromPhoto) setInput(text)
      const result = await onPreview(text)
      if (!work.signal.aborted) setPreview(fromPhoto ? { ...result, format: 'Photo or screenshot' } : result)
    } catch (reason) {
      if (!work.signal.aborted) setError(reason instanceof Error ? reason.message : 'This puzzle could not be opened.')
    } finally {
      if (pending.current === work) pending.current = null
      if (!work.signal.aborted) setBusy(false)
    }
  }

  function saveAndContinue(puzzle: PuzzlePreview) {
    const added = finishImport(puzzle, false)
    setPreview(undefined)
    setPhoto(undefined)
    setInput('')
    if (!added) setStatus('This puzzle is already in Your puzzles.')
    else if (!roomStore.getSnapshot().storageAvailable) setStatus('Puzzle available for this session. Local storage is unavailable.')
    else setStatus('Puzzle saved for later.')
  }

  function usePhoto(image: Blob) {
    if (pending.current) return
    setCameraOpen(false)
    setError('')
    setStatus('')
    setPhoto(image)
  }

  function pasteImage(event: ClipboardEvent) {
    if (event.defaultPrevented || busy || preview || photo || cameraOpen) return
    const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/')) ??
      Array.from(event.clipboardData.items).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
    if (!image) return
    event.preventDefault()
    usePhoto(image)
  }

  function backToInput() {
    pending.current?.abort()
    pending.current = null
    setBusy(false)
    setError('')
    setPhoto(undefined)
    setCameraOpen(false)
  }

  const puzzlePreview = preview && (
    <div className="import-preview">
      <p className="import-preview-meta" ref={summary} tabIndex={-1}>
        <strong>{preview.game.grid?.size === 6 ? '6 × 6 Sudoku' : preview.game.grid ? 'Mini Sudoku · 4 × 4' : variantName(preview.game.variant)}</strong>
        <span className="import-preview-rating">
          {preview.game.difficulty
            ? <span><span>Difficulty</span> <strong>{DIFFICULTY_LABELS[preview.game.difficulty]}</strong></span>
            : <strong>{preview.game.difficulty === null ? 'Unrated' : 'Rating unavailable'}</strong>}
          {preview.game.score != null && <span><span>Score</span> <strong>{preview.game.score}</strong></span>}
        </span>
        <span className="import-preview-format">{preview.format}</span>
      </p>
      <Board grid={preview.game.grid} label="Puzzle preview" givens={preview.game.givens} values={preview.game.givens}
        variantPuzzle={preview.game.variant?.puzzle} algebraicCages={preview.game.algebraic?.rules} sixRules={preview.game.six?.rules} showGuides={false} />
      {preview.game.algebraic ? <>
        {preview.game.algebraic.source?.author && <p>By {preview.game.algebraic.source.author}</p>}
        <ul className="import-preview-rules">
          {algebraicRules(preview.game.algebraic).map(rule => <li key={rule}>{rule}</li>)}
        </ul>
      </> : preview.game.grid?.size === 4 && <p>{MINI_RULE}</p>}
      {preview.game.six && preview.game.grid?.size === 6 && <ul className="import-preview-rules">
        {sixRuleDescriptions(preview.game.grid, preview.game.six.rules).map(rule => <li key={rule}>{rule}</li>)}
      </ul>}
      {preview.game.variant && <ul className="import-preview-rules">
        {variantRuleDescriptions(preview.game.variant.puzzle).map(rule => <li key={rule}>{rule}</li>)}
      </ul>}
      <div className="dialog-actions import-preview-actions">
        <Button type="button" className="import-edit" onClick={() => setPreview(undefined)}>
          {photo ? 'Edit givens' : 'Edit input'}
        </Button>
        <Button type="button" onClick={() => saveAndContinue(preview)}>
          <Bookmark size={17} aria-hidden="true" /> Save and import another
        </Button>
        <Button type="button" variant="primary" onClick={() => { finishImport(preview, true); onPlay?.() }}>
          <Play size={17} aria-hidden="true" /> Start playing
        </Button>
      </div>
    </div>
  )

  const source = (
    <form className="dialog-form import-form" onPaste={pasteImage}
      onSubmit={(event) => { event.preventDefault(); void check(input) }}>
      <p>Paste a puzzle code, link, or text grid. The app detects the format.</p>
      <label htmlFor={id}>Puzzle text or link</label>
      <textarea id={id} value={input} onChange={(event) => { setInput(event.target.value); setError(''); setStatus('') }}
        rows={5} placeholder="Paste a puzzle here" maxLength={MAX_IMPORT_LENGTH} spellCheck={false}
        autoCapitalize="off" autoFocus={!fullPage} required disabled={busy} />
      {error && <p className="form-error" role="alert">{error}</p>}
      {status && <p className="dialog-status" role="status">{status}</p>}
      <div className="dialog-actions spread">
        <label className={buttonClassName('secondary', 'file-picker')}><FileUp size={17} aria-hidden="true" /> Open text file
          <input type="file" accept=".txt,.sdk,.sdm,.hkl,.json,text/plain,application/json" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void check(file)
          }} />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !input.trim()}>{busy ? 'Checking puzzle…' : 'Preview puzzle'}</Button>
      </div>
      <section className="import-photo-source" aria-label="Import from an image">
        <p>Paste a screenshot here, choose an image, or take a photo of a Classic Sudoku puzzle.</p>
        <div className="import-photo-buttons">
          <label className={buttonClassName('secondary', 'file-picker')}><ImageUp size={17} aria-hidden="true" /> Choose image
            <input type="file" accept={PHOTO_TYPES} disabled={busy} onChange={event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) usePhoto(file)
            }} />
          </label>
          <Button type="button" disabled={busy} onClick={() => {
            if (typeof navigator.mediaDevices?.getUserMedia === 'function') setCameraOpen(true)
            else nativeCamera.current?.click()
          }}>
            <Camera size={17} aria-hidden="true" /> Take photo
          </Button>
          <input ref={nativeCamera} type="file" accept={PHOTO_TYPES} capture="environment" hidden
            onChange={event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) usePhoto(file)
            }} />
        </div>
      </section>
    </form>
  )

  const content = <>
    {preview && puzzlePreview}
    {photo && <PhotoPuzzleReview image={photo} visible={!preview} onBack={backToInput}
      onCheck={givens => void check(givens, true)} onEdit={() => setError('')} checking={busy} checkError={error} />}
    {cameraOpen && <PuzzleCamera onCapture={usePhoto} onCancel={backToInput} />}
    {!preview && !photo && !cameraOpen && source}
  </>

  if (fullPage) return (
    <main className={`puzzles-page puzzles-subscreen import-page${photo && !preview ? ' import-image-view' : ''}`} aria-labelledby={`${id}-heading`} onPaste={pasteImage}>
      <header className="puzzles-page-heading">
        <IconButton type="button" className="puzzles-back"
          aria-label={preview && photo ? 'Back to detected givens' : preview || photo || cameraOpen ? 'Back to puzzle input' : 'Leave puzzle import'}
          onClick={preview ? () => setPreview(undefined) : photo || cameraOpen ? backToInput : close}><ArrowLeft size={21} /></IconButton>
        <h1 id={`${id}-heading`} ref={heading} tabIndex={-1}>{title}</h1>
      </header>
      {content}
    </main>
  )

  return <Modal title={title} onClose={close} className="import-dialog">{content}</Modal>
}
