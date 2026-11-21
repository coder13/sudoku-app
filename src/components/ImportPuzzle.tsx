import { Link } from '@tanstack/react-router'
import { fogView } from '../sudoku/fog'
import { Button, IconButton, buttonClassName } from './Button'
import { type ClipboardEvent, lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, Camera, FileUp, ImageUp, Play } from 'lucide-react'
import { numberPuzzleDestination } from '../number-puzzles/catalog'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { deviceSync } from '../sudoku/device-sync'
import { valuesOf } from '../sudoku/game'
import { sizedRuleDescriptions } from '../sudoku/sized-rule-game'
import { algebraicRules } from '../sudoku/algebraic-play'
import { PHOTO_TYPES } from '../sudoku/photo-image'
import { MAX_IMPORT_LENGTH } from '../sudoku/puzzle-import'
import { findImportAttempt, prepareImportedPuzzle, preparePlayableImport, type PlayableImport, type PuzzlePreview } from '../sudoku/puzzle-preview'
import { applyPuzzleGrade, needsPuzzleGrade } from '../sudoku/puzzle-rating'
import { roomStore } from '../sudoku/storage'
import { variantName, variantRuleDescriptions } from '../sudoku/variants'
import { MINI_RULE, sizedGridName } from '../sudoku/new-puzzle'
import { Board } from './Board'
import { Modal } from './Modal'
import { PhotoPuzzleReview } from './PhotoPuzzleReview'
import { PuzzleCamera } from './PuzzleCamera'
export type { PuzzlePreview } from '../sudoku/puzzle-preview'

const LazyFutoshikiImportPreview = lazy(async () => {
  const { FutoshikiImportPreview } = await import('./Futoshiki')
  return { default: FutoshikiImportPreview }
})

const LazyCalcudokuImportChoices = lazy(async () => {
  const { CalcudokuImportChoices } = await import('./Calcudoku')
  return { default: CalcudokuImportChoices }
})

const LazyCalcudokuImportPreview = lazy(async () => {
  const { CalcudokuImportPreview } = await import('./Calcudoku')
  return { default: CalcudokuImportPreview }
})

type ReadyImport = Exclude<PlayableImport, { calcudokuSource: unknown }>

function preparePuzzle(input: string): Promise<PlayableImport> {
  return preparePlayableImport(input, roomStore.getSnapshot().games)
}

export function finishImport(preview: PuzzlePreview, play: boolean) {
  const { game, grade } = preview
  const existing = findImportAttempt(roomStore.getSnapshot().games, preview)
  if (existing) {
    if (grade !== undefined && needsPuzzleGrade(existing)) {
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
  const preview = await prepareImportedPuzzle(input, roomStore.getSnapshot().games)
  if (cancelled()) return
  if (freshCopy) roomStore.add(preview.game)
  else finishImport(preview, true)
}

export function ImportPuzzle({ close, onPlay, fullPage = false, onPreview = preparePuzzle }: {
  close: () => void
  onPlay?: () => void
  fullPage?: boolean
  onPreview?: (input: string) => Promise<PlayableImport>
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
  const [preview, setPreview] = useState<PlayableImport>()
  const [photo, setPhoto] = useState<Blob>()
  const [cameraOpen, setCameraOpen] = useState(false)
  const calcudokuSource = preview && 'calcudokuSource' in preview ? preview.calcudokuSource : undefined
  const title = calcudokuSource ? 'Choose cage operations' : preview ? 'Preview puzzle' : photo ? 'Confirm image' : cameraOpen ? 'Photograph puzzle' : 'Import puzzle'

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

  async function saveAndContinue(puzzle: ReadyImport) {
    let added: boolean
    if (!('game' in puzzle)) {
      setBusy(true)
      try {
        const saved = 'futoshiki' in puzzle
          ? (await import('../futoshiki/imported-storage')).saveFutoshikiImport(puzzle.futoshiki)
          : (await import('../calcudoku/imported-storage')).saveCalcudokuImport(puzzle.calcudoku)
        if (saved === 'unavailable') {
          setError('This browser cannot save the puzzle. Start playing to open it.')
          return
        }
        added = saved === 'added'
      } catch {
        setError('The app could not save the puzzle. Try again.')
        return
      } finally {
        setBusy(false)
      }
    } else added = finishImport(puzzle, false)
    setError('')
    setPreview(undefined)
    setPhoto(undefined)
    setInput('')
    if (!added) setStatus('This puzzle is already in Your puzzles.')
    else if ('game' in puzzle && !roomStore.getSnapshot().storageAvailable) setStatus('Puzzle available for this session. Local storage is unavailable.')
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

  const ready = preview && !('calcudokuSource' in preview) ? preview : undefined
  const futoshiki = ready && 'futoshiki' in ready ? ready.futoshiki : undefined
  const calcudoku = ready && 'calcudoku' in ready ? ready.calcudoku : undefined
  const game = ready && 'game' in ready ? ready.game : undefined
  const fog = game && fogView(game.variant, game.position.entries)
  const destination = futoshiki ? numberPuzzleDestination('futoshiki', futoshiki)
    : calcudoku ? numberPuzzleDestination('calcudoku', calcudoku) : undefined
  const puzzlePreview = ready && (
    <div className="import-preview">
      <p className="import-preview-meta" ref={summary} tabIndex={-1}>
        {futoshiki && <strong>Futoshiki · {futoshiki.puzzle.size} × {futoshiki.puzzle.size}</strong>}
        {calcudoku && <strong>Calcudoku · {calcudoku.puzzle.size} × {calcudoku.puzzle.size}</strong>}
        {game && <>
          <strong>{game.grid?.size === 4 ? 'Mini Sudoku · 4 × 4'
            : game.grid ? sizedGridName(game.grid) : variantName(game.variant)}</strong>
          <span className="import-preview-rating">
            {game.difficulty
              ? <span><span>Difficulty</span> <strong>{DIFFICULTY_LABELS[game.difficulty]}</strong></span>
              : <strong>{game.difficulty === null ? 'Unrated' : 'Rating unavailable'}</strong>}
            {game.score != null && <span><span>Score</span> <strong>{game.score}</strong></span>}
          </span>
        </>}
        <span className="import-preview-format">{ready.format}</span>
      </p>
      {(futoshiki || calcudoku) && <Suspense fallback={<p role="status">Loading puzzle preview…</p>}>
        {futoshiki ? <LazyFutoshikiImportPreview entry={futoshiki} />
          : calcudoku && <LazyCalcudokuImportPreview entry={calcudoku} />}
      </Suspense>}
      {'game' in ready && game && <>
        {ready.hasProgress && <p>This import includes your progress.</p>}
        <Board grid={game.grid} whispersGuide={game.whispersGuide} label="Puzzle preview" givens={game.givens} values={valuesOf(game)}
          givenCellColors={game.givenCellColors} authoredArtwork={game.authoredArtwork}
          position={ready.hasProgress ? game.position : undefined} candidateLayout="center-corner"
          variantPuzzle={game.variant?.puzzle} fog={fog} algebraicCages={game.algebraic?.rules} sizedRules={game.sized?.rules} showGuides={false} />
        {game.algebraic ? <>
          {game.algebraic.source?.author && <p>By {game.algebraic.source.author}</p>}
          <ul className="import-preview-rules">
            {algebraicRules(game.algebraic).map(rule => <li key={rule}>{rule}</li>)}
          </ul>
        </> : game.grid?.size === 4 && <p>{MINI_RULE}</p>}
        {game.sized?.author && <p>By {game.sized.author}</p>}
        {game.sized && game.grid && <ul className="import-preview-rules">
          {sizedRuleDescriptions(game.grid, game.sized.rules).map(rule => <li key={rule}>{rule}</li>)}
        </ul>}
        {game.variant && <ul className="import-preview-rules">
          {variantRuleDescriptions(fog?.puzzle ?? game.variant.puzzle, game.variant.fog).map(rule => <li key={rule}>{rule}</li>)}
        </ul>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions import-preview-actions">
        <Button type="button" className="import-edit" disabled={busy} onClick={() => { setPreview(undefined); setError('') }}>
          {photo ? 'Edit givens' : 'Edit input'}
        </Button>
        <Button type="button" disabled={busy} onClick={() => void saveAndContinue(ready)}>
          <Bookmark size={17} aria-hidden="true" /> Save and import another
        </Button>
        {destination ? <Link className={buttonClassName('primary')} {...destination}
          state={fullPage ? { fromNumberPuzzleImport: true } : undefined}>
          <Play size={17} aria-hidden="true" /> Start playing
        </Link> : 'game' in ready && <Button type="button" variant="primary" onClick={() => { finishImport(ready, true); onPlay?.() }}>
          <Play size={17} aria-hidden="true" /> {ready.hasProgress ? 'Open puzzle' : 'Start playing'}
        </Button>}
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
    {puzzlePreview}
    {calcudokuSource && preview && <Suspense fallback={<p role="status">Loading cage choices…</p>}>
      <LazyCalcudokuImportChoices source={calcudokuSource} onResolve={entry => setPreview({ calcudoku: entry, format: preview.format })} />
    </Suspense>}
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
          onClick={preview ? () => { setPreview(undefined); setError('') } : photo || cameraOpen ? backToInput : close}><ArrowLeft size={21} /></IconButton>
        <h1 id={`${id}-heading`} ref={heading} tabIndex={-1}>{title}</h1>
      </header>
      {content}
    </main>
  )

  return <Modal title={title} onClose={close} className="import-dialog">{content}</Modal>
}
