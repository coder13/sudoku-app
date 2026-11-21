import { Link } from '@tanstack/react-router'
import { fogView } from '../sudoku/fog'
import { Button, IconButton, buttonClassName } from './Button'
import { type ClipboardEvent, lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, Camera, FileUp, ImageUp, Play } from 'lucide-react'
import { numberPuzzleDestination } from '../number-puzzles/catalog'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { deviceSync } from '../sudoku/device-sync'
import { createEngineSession } from '../sudoku/engine'
import { hasUniquenessProof, uniquenessKey, valuesOf } from '../sudoku/game'
import { sizedRuleDescriptions } from '../sudoku/sized-rule-game'
import { algebraicRules } from '../sudoku/algebraic-play'
import { PHOTO_TYPES } from '../sudoku/photo-image'
import { MAX_IMPORT_LENGTH, type ImportedPuzzle } from '../sudoku/puzzle-import'
import { findImportAttempt, prepareImportedPuzzle, preparePlayableImport, PuzzleVerificationError, type PlayableImport, type PuzzlePreview } from '../sudoku/puzzle-preview'
import { applyPuzzleGrade, needsPuzzleGrade, ratePuzzle } from '../sudoku/puzzle-rating'
import { originalSolutionStatus } from '../sudoku/puzzle-validation'
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

type PreviewProgress = { signal: AbortSignal; onDecoded: (puzzle: ImportedPuzzle) => void }

function preparePreview(input: string, progress: PreviewProgress): Promise<PlayableImport> {
  return preparePlayableImport(input, roomStore.getSnapshot().games, { ...progress, deferRating: true })
}

export function finishImport(preview: PuzzlePreview, play: boolean) {
  const { game, grade } = preview
  const existing = findImportAttempt(roomStore.getSnapshot().games, preview)
  if (existing) {
    if ((game.uniquenessProof && !hasUniquenessProof(existing)) || (grade !== undefined && needsPuzzleGrade(existing))) {
      roomStore.update(existing.id, current => {
        const { uniquenessProof } = game
        if (uniquenessProof && uniquenessProof !== uniquenessKey(current)) return current
        const updated = uniquenessProof && uniquenessProof !== current.uniquenessProof ? {
          ...current, uniquenessProof,
          variant: current.variant && game.variant ? { ...current.variant, solution: game.variant.solution } : current.variant,
        } : current
        return grade !== undefined && needsPuzzleGrade(updated) ? applyPuzzleGrade(updated, grade) : updated
      })
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

export function ImportPuzzle({ close, onPlay, fullPage = false, onPreview = preparePreview }: {
  close: () => void
  onPlay?: () => void
  fullPage?: boolean
  onPreview?: (input: string, progress: PreviewProgress) => Promise<PlayableImport>
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
  const [decoded, setDecoded] = useState<ImportedPuzzle>()
  const [verificationError, setVerificationError] = useState<PuzzleVerificationError['status']>()
  const [photo, setPhoto] = useState<Blob>()
  const [cameraOpen, setCameraOpen] = useState(false)
  const calcudokuSource = preview && 'calcudokuSource' in preview ? preview : undefined
  const showingPreview = Boolean(preview || decoded)
  const title = calcudokuSource ? 'Choose cage operations' : showingPreview ? 'Preview puzzle'
    : photo ? 'Confirm image' : cameraOpen ? 'Photograph puzzle' : 'Import puzzle'

  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (fullPage) {
      heading.current?.closest('main')?.scrollTo(0, 0)
      heading.current?.focus({ preventScroll: true })
    } else if (showingPreview) summary.current?.focus({ preventScroll: true })
  }, [fullPage, showingPreview, title])
  useEffect(() => {
    if (!preview || !('game' in preview) || !preview.ratingPending) return
    const engine = createEngineSession()
    const { game } = preview
    let current = true
    void ratePuzzle(game.givens, game.variant, engine.run).then(grade => {
      if (current) setPreview(latest => latest === preview
        ? { ...preview, game: applyPuzzleGrade(game, grade), grade, ratingPending: undefined } : latest)
    }).catch(() => {
      if (current) setPreview(latest => latest === preview ? { ...preview, ratingPending: undefined } : latest)
    }).finally(() => engine.close())
    return () => { current = false; engine.close() }
  }, [preview])

  async function check(source: string | File, fromPhoto = false) {
    if (pending.current) return
    const work = new AbortController()
    pending.current = work
    setBusy(true)
    setError('')
    setStatus('')
    setVerificationError(undefined)
    try {
      if (typeof source !== 'string' && source.size > MAX_IMPORT_LENGTH) throw new Error('Choose a text file containing one puzzle.')
      const text = typeof source === 'string' ? source : await source.text()
      if (work.signal.aborted) return
      if (!fromPhoto) setInput(text)
      const result = await onPreview(text, {
        signal: work.signal,
        onDecoded: puzzle => { if (!work.signal.aborted) setDecoded(puzzle) },
      })
      if (!work.signal.aborted) {
        setPreview(fromPhoto ? { ...result, format: 'Photo or screenshot' } : result)
        setDecoded(undefined)
      }
    } catch (reason) {
      if (!work.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'This puzzle could not be opened.')
        if (reason instanceof PuzzleVerificationError) setVerificationError(reason.status)
      }
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
    if (event.defaultPrevented || busy || showingPreview || photo || cameraOpen) return
    const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/')) ??
      Array.from(event.clipboardData.items).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
    if (!image) return
    event.preventDefault()
    usePhoto(image)
  }

  function editPreview() {
    pending.current?.abort()
    pending.current = null
    setBusy(false)
    setError('')
    setPreview(undefined)
    setDecoded(undefined)
    setVerificationError(undefined)
  }

  function backToInput() {
    editPreview()
    setPhoto(undefined)
    setCameraOpen(false)
  }

  const ready = preview && !('calcudokuSource' in preview) ? preview : undefined
  const futoshiki = ready && 'futoshiki' in ready ? ready.futoshiki : undefined
  const calcudoku = ready && 'calcudoku' in ready ? ready.calcudoku : undefined
  const sudoku = ready && 'game' in ready ? ready : undefined
  const puzzle = sudoku?.game ?? decoded
  const progress = sudoku ? sudoku.hasProgress ? sudoku.game.position : undefined : decoded?.progress
  const hasProgress = Boolean(progress || futoshiki?.initialPosition || calcudoku?.initialPosition)
  const fog = fogView(puzzle?.variant, progress?.entries)
  const proofStatus = sudoku && hasUniquenessProof(sudoku.game) ? 'unique' : verificationError ?? (busy ? 'checking' : 'unverified')
  const destination = futoshiki ? numberPuzzleDestination('futoshiki', futoshiki)
    : calcudoku ? numberPuzzleDestination('calcudoku', calcudoku) : undefined
  const puzzlePreview = (puzzle || futoshiki || calcudoku) && (
    <div className="import-preview">
      <p className="import-preview-meta" ref={summary} tabIndex={-1}>
        {futoshiki && <strong>Futoshiki · {futoshiki.puzzle.size} × {futoshiki.puzzle.size}</strong>}
        {calcudoku && <strong>Calcudoku · {calcudoku.puzzle.size} × {calcudoku.puzzle.size}</strong>}
        {puzzle && <>
          <strong>{puzzle.grid?.size === 4 ? 'Mini Sudoku · 4 × 4'
            : puzzle.grid ? sizedGridName(puzzle.grid) : variantName(puzzle.variant)}</strong>
          {!puzzle.grid && <span className="import-preview-rating" role="status">{originalSolutionStatus[proofStatus]}</span>}
          {sudoku && <span className="import-preview-rating" aria-live="polite">
            {sudoku.ratingPending ? <strong>Rating…</strong> : sudoku.game.difficulty
              ? <span><span>Difficulty</span> <strong>{DIFFICULTY_LABELS[sudoku.game.difficulty]}</strong></span>
              : <strong>{sudoku.game.difficulty === null ? 'Unrated' : 'Rating unavailable'}</strong>}
            {sudoku.game.score != null && <span><span>Score</span> <strong>{sudoku.game.score}</strong></span>}
          </span>}
        </>}
        <span className="import-preview-format">{photo ? 'Photo or screenshot' : ready?.format ?? decoded?.format}</span>
      </p>
      {hasProgress && <p>This import includes your progress.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {(futoshiki || calcudoku) && <Suspense fallback={<p role="status">Loading puzzle preview…</p>}>
        {futoshiki ? <LazyFutoshikiImportPreview entry={futoshiki} />
          : calcudoku && <LazyCalcudokuImportPreview entry={calcudoku} />}
      </Suspense>}
      {puzzle && <>
        <Board grid={puzzle.grid} whispersGuide={puzzle.whispersGuide} label="Puzzle preview" givens={puzzle.givens}
          values={sudoku ? valuesOf(sudoku.game) : [...puzzle.givens].map((digit, cell) => digit === '0' ? progress?.entries[cell] ?? '0' : digit).join('')}
          givenCellColors={puzzle.givenCellColors} authoredArtwork={puzzle.authoredArtwork}
          position={progress} candidateLayout="center-corner"
          variantPuzzle={puzzle.variant?.puzzle} fog={fog} algebraicCages={sudoku?.game.algebraic?.rules} sizedRules={sudoku?.game.sized?.rules} showGuides={false} />
        {sudoku?.game.algebraic ? <>
          {sudoku.game.algebraic.source?.author && <p>By {sudoku.game.algebraic.source.author}</p>}
          <ul className="import-preview-rules">
            {algebraicRules(sudoku.game.algebraic).map(rule => <li key={rule}>{rule}</li>)}
          </ul>
        </> : puzzle.grid?.size === 4 && <p>{MINI_RULE}</p>}
        {sudoku?.game.sized?.author && <p>By {sudoku.game.sized.author}</p>}
        {sudoku?.game.sized && sudoku.game.grid && <ul className="import-preview-rules">
          {sizedRuleDescriptions(sudoku.game.grid, sudoku.game.sized.rules).map(rule => <li key={rule}>{rule}</li>)}
        </ul>}
        {puzzle.variant && <ul className="import-preview-rules">
          {variantRuleDescriptions(fog?.puzzle ?? puzzle.variant.puzzle, puzzle.variant.fog).map(rule => <li key={rule}>{rule}</li>)}
        </ul>}
      </>}
      <div className="dialog-actions import-preview-actions">
        <Button type="button" className="import-edit" disabled={Boolean(ready && busy)} onClick={editPreview}>
          {photo ? 'Edit givens' : 'Edit input'}
        </Button>
        <Button type="button" disabled={!ready || busy} onClick={() => { if (ready) void saveAndContinue(ready) }}>
          <Bookmark size={17} aria-hidden="true" /> Save and import another
        </Button>
        {destination ? <Link className={buttonClassName('primary')} {...destination}
          state={fullPage ? { fromNumberPuzzleImport: true } : undefined}>
          <Play size={17} aria-hidden="true" /> {hasProgress ? 'Open puzzle' : 'Start playing'}
        </Link> : <Button type="button" variant="primary" disabled={!sudoku} onClick={() => { if (sudoku) { finishImport(sudoku, true); onPlay?.() } }}>
          <Play size={17} aria-hidden="true" /> {hasProgress ? 'Open puzzle' : 'Start playing'}
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
    {calcudokuSource && <Suspense fallback={<p role="status">Loading cage choices…</p>}>
      <LazyCalcudokuImportChoices source={calcudokuSource.calcudokuSource}
        onResolve={entry => setPreview({ calcudoku: entry, format: calcudokuSource.format })} />
    </Suspense>}
    {photo && <PhotoPuzzleReview image={photo} visible={!showingPreview} onBack={backToInput}
      onCheck={givens => void check(givens, true)} onEdit={() => setError('')} checking={busy} checkError={error} />}
    {cameraOpen && <PuzzleCamera onCapture={usePhoto} onCancel={backToInput} />}
    {!showingPreview && !photo && !cameraOpen && source}
  </>

  if (fullPage) return (
    <main className={`puzzles-page puzzles-subscreen import-page${photo && !showingPreview ? ' import-image-view' : ''}`} aria-labelledby={`${id}-heading`} onPaste={pasteImage}>
      <header className="puzzles-page-heading">
        <IconButton type="button" className="puzzles-back"
          aria-label={showingPreview && photo ? 'Back to detected givens' : showingPreview || photo || cameraOpen ? 'Back to puzzle input' : 'Leave puzzle import'}
          onClick={showingPreview ? editPreview : photo || cameraOpen ? backToInput : close}><ArrowLeft size={21} /></IconButton>
        <h1 id={`${id}-heading`} ref={heading} tabIndex={-1}>{title}</h1>
      </header>
      {content}
    </main>
  )

  return <Modal title={title} onClose={close} className="import-dialog">{content}</Modal>
}
