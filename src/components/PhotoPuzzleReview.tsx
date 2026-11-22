import { Button } from './Button'
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { candidateCount, conflictsOf } from '../sudoku/game'
import type { PhotoCrop } from '../sudoku/photo-crop'
import { cropPuzzlePhoto, openPuzzlePhoto } from '../sudoku/photo-image'
import type { PhotoProgress } from '../sudoku/puzzle-preview'
import { PhotoCropEditor } from './PhotoCropEditor'

type Photo = Awaited<ReturnType<typeof openPuzzlePhoto>>
type Review = { digits: string[]; entryCells: Set<number>; candidates?: number[]; review: Set<number>; url: string; crop: PhotoCrop }
export type PhotoImportOptions = { startFresh?: true; progress?: PhotoProgress }

export function PhotoPuzzleReview({ image, onBack, onCheck, onEdit, checking, checkError, visible }: {
  image: Blob
  onBack: () => void
  onCheck: (givens: string, options: PhotoImportOptions) => void
  onEdit: () => void
  checking: boolean
  checkError: string
  visible: boolean
}) {
  const [photo, setPhoto] = useState<Photo>()
  const [crop, setCrop] = useState<PhotoCrop>()
  const [result, setResult] = useState<Review>()
  const [adjusting, setAdjusting] = useState(false)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [activeCell, setActiveCell] = useState(0)
  const pending = useRef<AbortController | null>(null)
  const instructions = useRef<HTMLParagraphElement>(null)
  const keyboardHelp = useId()
  const reviewing = adjusting || reading ? undefined : result
  const editingCrop = reviewing || reading || !photo ? undefined : crop

  const cancelScan = useCallback(() => {
    const work = pending.current
    pending.current = null
    work?.abort()
  }, [])

  const scan = useCallback(async (source: Photo, selection: PhotoCrop, automatic = false) => {
    if (pending.current) return
    const work = new AbortController()
    pending.current = work
    setError('')
    setReading(true)
    try {
      const { readPuzzlePhoto } = await import('../sudoku/photo-ocr')
      work.signal.throwIfAborted()
      const { canvas, pixels } = cropPuzzlePhoto(source.canvas, selection)
      const { givens: digits, entryCells, candidates, review } = await readPuzzlePhoto(pixels, work.signal)
      if (!work.signal.aborted) {
        if (automatic && digits.filter(digit => digit !== '0').length < 10) {
          setError('Only a few digits came through. Check the crop and try again.')
          return
        }
        setActiveCell(review.values().next().value ?? 0)
        setResult({ digits, entryCells, candidates, review, url: canvas.toDataURL('image/jpeg', 0.93), crop: selection })
        setAdjusting(false)
      }
    } catch (reason) {
      if (!work.signal.aborted) setError(reason instanceof Error ? reason.message : 'The image could not be read.')
    } finally {
      if (pending.current === work) {
        pending.current = null
        setReading(false)
      }
    }
  }, [])

  useEffect(() => {
    const open = new AbortController()
    void openPuzzlePhoto(image, open.signal).then(photo => {
      if (open.signal.aborted) return
      setPhoto(photo)
      setCrop(photo.crop)
      if (photo.detected) void scan(photo, photo.detected, true)
    }, reason => {
      if (!open.signal.aborted) setError(reason instanceof Error ? reason.message : 'The image could not be opened.')
    })
    return () => {
      open.abort()
      cancelScan()
    }
  }, [image, scan, cancelScan])

  const showInstructions = Boolean(reviewing || editingCrop)
  const inReview = Boolean(reviewing)
  useEffect(() => {
    if (visible && showInstructions) instructions.current?.focus({ preventScroll: true })
  }, [visible, showInstructions, inReview])

  function back() {
    if (!result) {
      onBack()
      return
    }
    cancelScan()
    setCrop(result.crop)
    setError('')
    setReading(false)
    setAdjusting(false)
  }

  function changeCell(index: number, digit: string) {
    setResult(current => {
      if (!current) return current
      const digits = [...current.digits]
      const review = new Set(current.review)
      digits[index] = digit
      review.delete(index)
      return { ...current, digits, review }
    })
    onEdit()
  }

  function moveCell(event: KeyboardEvent<HTMLInputElement>, cell: number) {
    const next = event.key === 'ArrowLeft' && cell % 9 > 0 ? cell - 1
      : event.key === 'ArrowRight' && cell % 9 < 8 ? cell + 1
      : event.key === 'ArrowUp' && cell >= 9 ? cell - 9
      : event.key === 'ArrowDown' && cell < 72 ? cell + 9
      : undefined
    if (next === undefined) return
    event.preventDefault()
    event.currentTarget.parentElement?.querySelector<HTMLInputElement>(`[data-cell="${next}"]`)?.focus()
  }

  function changeEntry(isEntry: boolean) {
    setResult(current => {
      if (!current) return current
      const entryCells = new Set(current.entryCells)
      if (isEntry) entryCells.add(activeCell)
      else entryCells.delete(activeCell)
      const review = new Set(current.review)
      review.delete(activeCell)
      return { ...current, entryCells, review }
    })
    onEdit()
  }

  const conflicts = reviewing && conflictsOf(reviewing.digits.join(''))
  const candidates = reviewing?.candidates?.map((mask, cell) => reviewing.digits[cell] === '0' ? mask : 0)
  const pencilMarkCount = candidates?.reduce((sum, mask) => sum + candidateCount(mask), 0) ?? 0
  const entries = reviewing?.digits.map((digit, cell) => reviewing.entryCells.has(cell) ? digit : '0').join('') ?? ''
  const givens = reviewing?.digits.map((digit, cell) => reviewing.entryCells.has(cell) ? '0' : digit).join('') ?? ''
  const entryCount = entries.replaceAll('0', '').length
  const progressCounts = [
    entryCount ? `${entryCount} player ${entryCount === 1 ? 'entry' : 'entries'}` : '',
    pencilMarkCount ? `${pencilMarkCount} ${pencilMarkCount === 1 ? 'candidate' : 'candidates'}` : '',
  ].filter(Boolean).join(' and ')
  const canMarkEntry = reviewing && (reviewing.candidates !== undefined || reviewing.entryCells.size > 0)
  const canPreview = !checking && /[1-9]/.test(givens)
  return <section className="photo-import" hidden={!visible}>
    {reviewing ? <>
      <p className="sr-only" ref={instructions} tabIndex={-1}>Compare the grid with the image and check highlighted cells.
        {canMarkEntry ? ' Mark player entries with the checkbox.' : ' Clear any player entries.'}
        {' If the image shows extra rules, use a puzzle code or link.'}</p>
      <p className="sr-only" id={keyboardHelp}>Use the arrow keys to move between cells.</p>
      <div className="photo-stage">
        <div className="photo-review">
          <img src={reviewing.url} alt="Cropped puzzle image" width={576} height={576} />
          <div className="photo-edit-grid" role="group" aria-label="Edit scanned Sudoku digits" aria-describedby={keyboardHelp}>
            {reviewing.digits.map((digit, cell) => (
              <input key={cell} type="text" inputMode="numeric" autoComplete="off"
                aria-label={`Row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1}${reviewing.entryCells.has(cell) && digit !== '0' ? ', player entry' : ''}${reviewing.review.has(cell) ? ', needs review' : ''}`}
                aria-invalid={conflicts?.has(cell) || undefined}
                data-review={reviewing.review.has(cell) || undefined} data-entry={reviewing.entryCells.has(cell) || undefined}
                data-cell={cell} tabIndex={activeCell === cell ? 0 : -1}
                disabled={checking} value={digit === '0' ? '' : digit}
                onFocus={event => { setActiveCell(cell); event.currentTarget.select() }}
                onKeyDown={event => moveCell(event, cell)}
                onChange={event => changeCell(cell, event.target.value.replace(/[^1-9]/g, '').slice(-1) || '0')} />
            ))}
          </div>
        </div>
      </div>
      {checkError && <p className="form-error" role="alert">{checkError}</p>}
      {progressCounts && <p>Detected {progressCounts}. Keep your progress or start fresh.</p>}
      <div className="dialog-actions photo-actions">
        {canMarkEntry && <label className="photo-entry-option">
          <input type="checkbox" checked={reviewing.entryCells.has(activeCell)}
            disabled={checking || reviewing.digits[activeCell] === '0'}
            onChange={event => changeEntry(event.currentTarget.checked)} />
          Selected digit is a player entry
        </label>}
        <Button type="button" disabled={checking}
          onClick={() => { setAdjusting(true); onEdit() }}>Adjust crop</Button>
        {progressCounts && <Button type="button" disabled={!canPreview}
          onClick={() => onCheck(givens, { startFresh: true })}>Start fresh</Button>}
        <Button type="button" variant="primary" disabled={!canPreview}
          onClick={() => onCheck(givens, progressCounts ? { progress: { entries, candidates } } : {})}>
          {checking ? 'Checking puzzle…' : entryCount ? 'Import progress' : pencilMarkCount ? 'Import candidates' : 'Preview puzzle'}
        </Button>
      </div>
    </> : <>
      {editingCrop && photo && <>
        <p className="sr-only" ref={instructions} tabIndex={-1}>Drag the frame to move it. Line up the four corners with the full 9 × 9 grid.</p>
        <div className="photo-stage">
          <PhotoCropEditor url={photo.url} width={photo.canvas.width} height={photo.canvas.height}
            crop={editingCrop} onChange={setCrop} />
        </div>
      </>}
      {!photo && !error && <p role="status">Finding the grid…</p>}
      {reading && <p role="status">Reading digits…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions photo-actions">
        <Button type="button" onClick={back}>{result ? 'Back to review' : 'Choose another source'}</Button>
        {editingCrop && photo && <Button type="button" variant="primary"
          onClick={() => void scan(photo, editingCrop)}>Read digits</Button>}
      </div>
    </>}
  </section>
}
