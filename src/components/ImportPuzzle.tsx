import { fogView } from '../sudoku/fog'
import { useNavigate } from '@tanstack/react-router'
import { Button, IconButton, buttonClassName } from './Button'
import { lazy, Suspense, type ClipboardEvent, type Dispatch, type SetStateAction, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, Camera, Clipboard, FileUp, ImageUp, Play } from 'lucide-react'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { deviceSync } from '../sudoku/device-sync'
import { hasUniquenessProof, uniquenessKey, valuesOf } from '../sudoku/game'
import { sizedRuleDescriptions } from '../sudoku/sized-rule-game'
import { algebraicRules } from '../sudoku/algebraic-play'
import { PHOTO_TYPES } from '../sudoku/photo-image'
import type { VariantRule, VariantPuzzle } from '../sudoku/engine'
import { MAX_IMPORT_LENGTH } from '../sudoku/puzzle-import'
import { findImportAttempt, prepareImportedPuzzle, type PuzzlePreview } from '../sudoku/puzzle-preview'
import { applyPuzzleGrade, needsPuzzleGrade } from '../sudoku/puzzle-rating'
import { originalSolutionStatus } from '../sudoku/puzzle-validation'
import { roomStore } from '../sudoku/storage'
import { variantIdForPuzzle, variantName, variantRuleDescriptions, WINDOKU_REGIONS } from '../sudoku/variants'
import { MINI_RULE, sizedGridName } from '../sudoku/new-puzzle'
import { Board } from './Board'
import { Modal } from './Modal'
import { PhotoPuzzleReview, type PhotoImportOptions } from './PhotoPuzzleReview'
import { PuzzleCamera } from './PuzzleCamera'
import { PuzzleImportPreview } from './PuzzleImportPreview'
import { usePuzzleImportPreview, type PreviewProgress } from './usePuzzleImportPreview'
export type { PuzzlePreview } from '../sudoku/puzzle-preview'

const LazyFutoshikiImportPreview = lazy(async () => {
  const { FutoshikiImportPreview } = await import('./Futoshiki')
  return { default: FutoshikiImportPreview }
})
const LazyCalcudokuImportPreview = lazy(async () => {
  const { CalcudokuImportPreview } = await import('./Calcudoku')
  return { default: CalcudokuImportPreview }
})

function preparePuzzle(input: string): Promise<PuzzlePreview> {
  return prepareImportedPuzzle(input, roomStore.getSnapshot().games)
}

function preparePreview(input: string, progress: PreviewProgress): Promise<PuzzlePreview> {
  return prepareImportedPuzzle(input, roomStore.getSnapshot().games, {
    ...progress,
    deferRating: true,
  })
}

export function finishImport(preview: PuzzlePreview, play: boolean) {
  if (preview.futoshiki || preview.calcudoku) return false
  const { game, grade } = preview
  const existing = findImportAttempt(roomStore.getSnapshot().games, preview)
  if (existing) {
    if ((game.uniquenessProof && !hasUniquenessProof(existing)) || (grade !== undefined && needsPuzzleGrade(existing))) {
      roomStore.update(existing.id, (current) => {
        const { uniquenessProof } = game
        if (uniquenessProof && uniquenessProof !== uniquenessKey(current)) return current
        const updated =
          uniquenessProof && uniquenessProof !== current.uniquenessProof
            ? {
                ...current,
                uniquenessProof,
                variant: current.variant && game.variant ? { ...current.variant, solution: game.variant.solution } : current.variant,
              }
            : current
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
  const preview = await preparePuzzle(input)
  if (cancelled()) return
  if (preview.futoshiki || preview.calcudoku) return
  if (freshCopy) roomStore.add(preview.game)
  else finishImport(preview, true)
}

const MANUAL_RULESETS = [
  { key: 'diagonal', name: 'X Sudoku', description: 'Both long diagonals contain each digit once.' },
  { key: 'windoku', name: 'Windoku', description: 'The four extra 3 × 3 regions contain each digit once.' },
  { key: 'anti-knight', name: 'Anti-Knight', description: 'Cells a knight’s move apart cannot match.' },
  { key: 'anti-king', name: 'Anti-King', description: 'Touching cells cannot match.' },
  { key: 'non-consecutive', name: 'Non-Consecutive', description: 'Cells that share an edge cannot be consecutive.' },
  { key: 'global-entropy', name: 'Global Entropy', description: 'Each 2 × 2 area contains low, middle, and high digits.' },
] as const
type ManualRuleset = typeof MANUAL_RULESETS[number]['key']

/** Controlled 9×9 clue editor; import validation and rule construction stay with the host. */
function ManualPuzzleEntry({ givens, rulesets, error, busy, onGivensChange, onRulesetsChange, onBack, onCheck }: {
  givens: string
  rulesets: ManualRuleset[]
  error: string
  busy: boolean
  onGivensChange: Dispatch<SetStateAction<string>>
  onRulesetsChange: Dispatch<SetStateAction<ManualRuleset[]>>
  onBack: () => void
  onCheck: () => void
}) {
  const cells = useRef(new Map<number, HTMLInputElement>())
  return <section className="manual-puzzle-entry" aria-label="Enter a puzzle">
    <p>Enter the printed digits. Leave empty cells blank.</p>
    <div className="photo-edit-grid" role="group" aria-label="Enter Sudoku givens">
      {Array.from({ length: 81 }, (_, cell) => (
        <input
          key={cell}
          ref={element => { if (element) cells.current.set(cell, element); else cells.current.delete(cell) }}
          value={givens[cell] === '0' ? '' : givens[cell]}
          aria-label={`Row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`}
          inputMode="numeric"
          maxLength={1}
          onKeyDown={event => {
            const next = event.key === 'ArrowLeft' ? cell - 1 : event.key === 'ArrowRight' ? cell + 1
              : event.key === 'ArrowUp' ? cell - 9 : event.key === 'ArrowDown' ? cell + 9 : -1
            if (next >= 0 && next < 81) {
              event.preventDefault()
              cells.current.get(next)?.focus()
            }
          }}
          onChange={event => {
            const digit = event.currentTarget.value.replace(/[^1-9]/g, '').slice(-1) || '0'
            onGivensChange(current => `${current.slice(0, cell)}${digit}${current.slice(cell + 1)}`)
            if (digit !== '0' && cell < 80) cells.current.get(cell + 1)?.focus()
          }}
        />
      ))}
    </div>
    <fieldset className="manual-rulesets">
      <legend>Rulesets</legend>
      <p>Classic Sudoku rules always apply. Add any rules that also apply to this puzzle.</p>
      {MANUAL_RULESETS.map(({ key, name, description }) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={rulesets.includes(key)}
            onChange={event => {
              const checked = event.currentTarget.checked
              onRulesetsChange(current => checked ? [...current, key] : current.filter(value => value !== key))
            }}
          />
          <span><strong>{name}</strong><small>{description}</small></span>
        </label>
      ))}
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions spread">
      <Button type="button" onClick={onBack}>Back to import</Button>
      <Button type="button" variant="primary" disabled={busy || !/[1-9]/.test(givens)} onClick={onCheck}>
        {busy ? 'Checking puzzle…' : 'Check puzzle'}
      </Button>
    </div>
  </section>
}

/** Present text, file, image, camera, and manual puzzle sources without owning their import workflows. */
function ImportSourceForm({ id, input, busy, error, status, fullPage, onInputChange, onCheck, onTextFile,
  onPasteImage, onReadClipboardImage, onUsePhoto, onOpenCamera, onStartManualEntry }: {
  id: string
  input: string
  busy: boolean
  error: string
  status: string
  fullPage: boolean
  onInputChange: (input: string) => void
  onCheck: () => void
  onTextFile: (file: File) => void
  onPasteImage: (event: ClipboardEvent<HTMLFormElement>) => void
  onReadClipboardImage: () => void
  onUsePhoto: (image: Blob) => void
  onOpenCamera: () => void
  onStartManualEntry: () => void
}) {
  const nativeCamera = useRef<HTMLInputElement>(null)
  return <form className="dialog-form import-form" onPaste={onPasteImage} onSubmit={event => {
    event.preventDefault()
    onCheck()
  }}>
    <p>Paste a puzzle code, link, or text grid. The app detects the format.</p>
    <label htmlFor={id}>Puzzle text or link</label>
    <textarea
      id={id}
      value={input}
      onChange={event => onInputChange(event.currentTarget.value)}
      rows={5}
      placeholder="Paste a puzzle here"
      maxLength={MAX_IMPORT_LENGTH}
      spellCheck={false}
      autoCapitalize="off"
      autoFocus={!fullPage}
      required
      disabled={busy}
    />
    {error && <p className="form-error" role="alert">{error}</p>}
    {status && <p className="dialog-status" role="status">{status}</p>}
    <div className="dialog-actions spread">
      <label className={buttonClassName('secondary', 'file-picker')}>
        <FileUp size={17} aria-hidden="true" /> Open text file
        <input type="file" accept=".txt,.sdk,.sdm,.hkl,.json,text/plain,application/json" disabled={busy}
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) onTextFile(file)
          }} />
      </label>
      <Button type="submit" variant="primary" disabled={busy || !input.trim()}>
        {busy ? 'Checking puzzle…' : 'Preview puzzle'}
      </Button>
    </div>
    <section className="import-photo-source" aria-label="Import from an image">
      <p>Paste a screenshot with Ctrl+V, choose an image, or take a photo of a Classic Sudoku puzzle.</p>
      <div className="import-photo-buttons">
        <Button type="button" disabled={busy} onClick={onReadClipboardImage}>
          <Clipboard size={17} aria-hidden="true" /> Paste image
        </Button>
        <label className={buttonClassName('secondary', 'file-picker')}>
          <ImageUp size={17} aria-hidden="true" /> Choose image
          <input type="file" accept={PHOTO_TYPES} disabled={busy} onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) onUsePhoto(file)
          }} />
        </label>
        <Button type="button" disabled={busy} onClick={() => {
          if (typeof navigator.mediaDevices?.getUserMedia === 'function') onOpenCamera()
          else nativeCamera.current?.click()
        }}>
          <Camera size={17} aria-hidden="true" /> Take photo
        </Button>
        <input ref={nativeCamera} type="file" accept={PHOTO_TYPES} capture="environment" hidden onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) onUsePhoto(file)
        }} />
      </div>
    </section>
    <div className="import-manual-source">
      <p>Or enter the givens yourself and choose the rules.</p>
      <Button type="button" disabled={busy} onClick={onStartManualEntry}>Start with a blank grid</Button>
    </div>
  </form>
}

export function ImportPuzzle({
  close,
  onPlay,
  fullPage = false,
  onPreview = preparePreview,
}: {
  close: () => void
  onPlay?: () => void
  fullPage?: boolean
  onPreview?: (input: string, progress: PreviewProgress) => Promise<PuzzlePreview>
}) {
  const navigate = useNavigate()
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const summary = useRef<HTMLParagraphElement>(null)
  const {
    input, setInput, changeInput, busy, error, setError, clearError, status, setStatus, preview, setPreview, decoded,
    verificationError, check, resetPreview,
  } = usePuzzleImportPreview(onPreview)
  const [photo, setPhoto] = useState<Blob>()
  const [cameraOpen, setCameraOpen] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualGivens, setManualGivens] = useState('0'.repeat(81))
  const [manualRulesets, setManualRulesets] = useState<ManualRuleset[]>([])
  const showingPreview = Boolean(preview || decoded)
  const title = showingPreview ? 'Preview puzzle' : photo ? 'Confirm image' : cameraOpen ? 'Photograph puzzle' : manualMode ? 'Create puzzle' : 'Import puzzle'

  useEffect(() => {
    if (fullPage) {
      heading.current?.closest('main')?.scrollTo(0, 0)
      heading.current?.focus({ preventScroll: true })
    } else if (showingPreview) summary.current?.focus({ preventScroll: true })
  }, [fullPage, showingPreview, title])
  function checkManualPuzzle() {
    const rules: VariantRule[] = []
    if (manualRulesets.includes('diagonal')) rules.push({ type: 'diagonal', diagonal: 'main' }, { type: 'diagonal', diagonal: 'anti' })
    if (manualRulesets.includes('anti-knight')) rules.push({ type: 'anti-knight' })
    if (manualRulesets.includes('anti-king')) rules.push({ type: 'anti-king' })
    if (manualRulesets.includes('non-consecutive')) rules.push({ type: 'non-consecutive' })
    if (manualRulesets.includes('windoku'))
      rules.push(
        ...WINDOKU_REGIONS.map((cells) => ({
          type: 'extra-house' as const,
          cells,
        }))
      )
    if (manualRulesets.includes('global-entropy')) rules.push({ type: 'global-entropy' })
    const puzzle: VariantPuzzle = {
      version: 1,
      givens: manualGivens,
      ...(rules.length && { rules }),
    }
    const input = rules.length ? `#variant=${encodeURIComponent(JSON.stringify({ id: variantIdForPuzzle(puzzle), puzzle }))}` : manualGivens
    void check(input, undefined, true)
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
    if (busy) return
    setCameraOpen(false)
    setError('')
    setStatus('')
    setPhoto(image)
  }

  function pasteImage(event: ClipboardEvent) {
    if (event.defaultPrevented || busy || showingPreview || photo || cameraOpen) return
    const image =
      Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/')) ??
      Array.from(event.clipboardData.items)
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile()
    if (!image) return
    event.preventDefault()
    usePhoto(image)
  }

  async function readClipboardImage() {
    if (busy || showingPreview || photo || cameraOpen) return
    setError('')
    setStatus('')
    try {
      if (!navigator.clipboard?.read) throw new Error('Clipboard image access is not available here.')
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith('image/'))
        if (type) {
          usePhoto(await item.getType(type))
          return
        }
      }
      setError('No image found on the clipboard. Copy an image or paste it with Ctrl+V.')
    } catch {
      setError('Could not read an image from the clipboard. Paste it with Ctrl+V or choose an image file.')
    }
  }

  function editPreview() {
    resetPreview()
  }

  function backToInput() {
    editPreview()
    setPhoto(undefined)
    setCameraOpen(false)
  }

  const standalonePreview = preview && (preview.futoshiki || preview.calcudoku) ? preview : undefined
  const standalone = Boolean(standalonePreview)
  const puzzle = standalone ? undefined : (preview?.game ?? decoded)
  const progress = preview ? (preview.hasProgress ? preview.game.position : undefined) : decoded?.progress
  const fog = fogView(puzzle?.variant, progress?.entries)
  const proofStatus = standalone
    ? 'unique'
    : preview?.game.nonUnique
      ? 'multiple'
      : preview && hasUniquenessProof(preview.game)
        ? 'unique'
        : (verificationError ?? (busy ? 'checking' : 'unverified'))
  const puzzlePreview = puzzle && (
    <PuzzleImportPreview
      summaryRef={summary}
      hasProgress={Boolean(progress)}
      error={error}
      summary={
        <>
          <strong>{puzzle.grid?.size === 4 ? 'Mini Sudoku · 4 × 4' : puzzle.grid ? sizedGridName(puzzle.grid) : variantName(puzzle.variant)}</strong>
          {!puzzle.grid && (
            <span className="import-preview-rating" role="status">
              {originalSolutionStatus[proofStatus]}
            </span>
          )}
          {preview && (
            <span className="import-preview-rating" aria-live="polite">
              {preview.ratingPending ? (
                <strong>Rating…</strong>
              ) : preview.game.difficulty ? (
                <span>
                  <span>Difficulty</span> <strong>{DIFFICULTY_LABELS[preview.game.difficulty]}</strong>
                </span>
              ) : (
                <strong>{preview.game.difficulty === null ? 'Unrated' : 'Rating unavailable'}</strong>
              )}
              {preview.game.score != null && (
                <span>
                  <span>Score</span> <strong>{preview.game.score}</strong>
                </span>
              )}
            </span>
          )}
          <span className="import-preview-format">{photo ? 'Photo or screenshot' : (preview?.format ?? decoded?.format)}</span>
        </>
      }
      actions={
        <>
          <Button type="button" className="import-edit" onClick={editPreview}>
            {photo ? 'Edit scanned digits' : 'Edit input'}
          </Button>
          <Button
            type="button"
            disabled={!preview}
            onClick={() => {
              if (preview) saveAndContinue(preview)
            }}
          >
            <Bookmark size={17} aria-hidden="true" /> Save and import another
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!preview}
            onClick={() => {
              if (preview) {
                finishImport(preview, true)
                onPlay?.()
              }
            }}
          >
            <Play size={17} aria-hidden="true" /> {progress ? 'Open puzzle' : 'Start playing'}
          </Button>
        </>
      }
    >
      <Board
        content={{
          grid: puzzle.grid,
          whispersGuide: puzzle.whispersGuide,
          givens: puzzle.givens,
          values: preview ? valuesOf(preview.game) : [...puzzle.givens].map((digit, cell) => (digit === '0' ? (progress?.entries[cell] ?? '0') : digit)).join(''),
          givenCellColors: puzzle.givenCellColors,
          position: progress,
          variantPuzzle: puzzle.variant?.puzzle,
          fog: fog,
          algebraicCages: preview?.game.algebraic?.rules,
          sizedRules: preview?.game.sized?.rules,
        }}
        appearance={{
          label: 'Puzzle preview',
          authoredArtwork: puzzle.authoredArtwork,
          candidateLayout: 'center-corner',
          showGuides: false,
        }}
      />
      {preview?.game.algebraic ? (
        <>
          {preview.game.algebraic.source?.author && <p>By {preview.game.algebraic.source.author}</p>}
          <ul className="import-preview-rules">
            {algebraicRules(preview.game.algebraic).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </>
      ) : (
        puzzle.grid?.size === 4 && <p>{MINI_RULE}</p>
      )}
      {preview?.game.sized?.author && <p>By {preview.game.sized.author}</p>}
      {preview?.game.sized && preview.game.grid && (
        <ul className="import-preview-rules">
          {sizedRuleDescriptions(preview.game.grid, preview.game.sized.rules).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      )}
      {puzzle.variant && (
        <ul className="import-preview-rules">
          {variantRuleDescriptions(fog?.puzzle ?? puzzle.variant.puzzle, puzzle.variant.fog).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      )}
    </PuzzleImportPreview>
  )

  const numberPuzzlePreview = standalonePreview && (
    <PuzzleImportPreview
      summaryRef={summary}
      hasProgress={standalonePreview.hasProgress}
      error={error}
      summary={
        <>
          <strong>
            {standalonePreview.futoshiki
              ? `Futoshiki · ${standalonePreview.futoshiki.puzzle.size} × ${standalonePreview.futoshiki.puzzle.size}`
              : `Calcudoku · ${standalonePreview.calcudoku!.puzzle.size} × ${standalonePreview.calcudoku!.puzzle.size}`}
          </strong>
          <span className="import-preview-rating" role="status">
            {originalSolutionStatus[proofStatus]}
          </span>
          <span className="import-preview-format">{standalonePreview.format}</span>
        </>
      }
      actions={
        <>
          <Button type="button" className="import-edit" onClick={editPreview}>
            Edit input
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onPlay?.()
              if (standalonePreview.futoshiki) {
                void navigate({
                  to: '/puzzles/futoshiki/$puzzle',
                  params: { puzzle: standalonePreview.futoshiki.id },
                })
              } else if (standalonePreview.calcudoku) {
                void navigate({
                  to: '/puzzles/calcudoku/$puzzle',
                  params: { puzzle: standalonePreview.calcudoku.id },
                })
              }
            }}
          >
            <Play size={17} aria-hidden="true" /> {standalonePreview.hasProgress ? 'Open puzzle' : 'Start playing'}
          </Button>
        </>
      }
    >
      <Suspense fallback={<p role="status">Loading puzzle preview…</p>}>
        {standalonePreview.futoshiki ? (
          <LazyFutoshikiImportPreview entry={standalonePreview.futoshiki} />
        ) : (
          standalonePreview.calcudoku && <LazyCalcudokuImportPreview entry={standalonePreview.calcudoku} />
        )}
      </Suspense>
    </PuzzleImportPreview>
  )

  const source = <ImportSourceForm
    id={id}
    input={input}
    busy={busy}
    error={error}
    status={status}
    fullPage={fullPage}
    onInputChange={changeInput}
    onCheck={() => { void check(input) }}
    onTextFile={file => { void check(file) }}
    onPasteImage={pasteImage}
    onReadClipboardImage={() => { void readClipboardImage() }}
    onUsePhoto={usePhoto}
    onOpenCamera={() => setCameraOpen(true)}
    onStartManualEntry={() => setManualMode(true)}
  />

  const manualEntry = <ManualPuzzleEntry
    givens={manualGivens}
    rulesets={manualRulesets}
    error={error}
    busy={busy}
    onGivensChange={setManualGivens}
    onRulesetsChange={setManualRulesets}
    onBack={() => { setManualMode(false); clearError() }}
    onCheck={checkManualPuzzle}
  />

  const content = (
    <>
      {numberPuzzlePreview}
      {puzzlePreview}
      {photo && (
        <PhotoPuzzleReview
          image={photo}
          visible={!showingPreview}
          onBack={backToInput}
          onCheck={(givens, options) => void check(givens, options)}
          onEdit={clearError}
          checking={busy}
          checkError={error}
        />
      )}
      {cameraOpen && <PuzzleCamera onCapture={usePhoto} onCancel={backToInput} />}
      {!showingPreview && !photo && !cameraOpen && (manualMode ? manualEntry : source)}
    </>
  )

  if (fullPage)
    return (
      <main className={`puzzles-page puzzles-subscreen import-page${photo && !showingPreview ? ' import-image-view' : ''}`} aria-labelledby={`${id}-heading`} onPaste={pasteImage}>
        <header className="puzzles-page-heading">
          <IconButton
            type="button"
            className="puzzles-back"
            aria-label={showingPreview && photo ? 'Back to image review' : showingPreview || photo || cameraOpen ? 'Back to puzzle input' : 'Leave puzzle import'}
            onClick={showingPreview ? editPreview : photo || cameraOpen ? backToInput : close}
          >
            <ArrowLeft size={21} />
          </IconButton>
          <h1 id={`${id}-heading`} ref={heading} tabIndex={-1}>
            {title}
          </h1>
        </header>
        {content}
      </main>
    )

  return (
    <Modal title={title} onClose={close} className="import-dialog">
      {content}
    </Modal>
  )
}
