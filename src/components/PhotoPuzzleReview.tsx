import { Button } from './Button'
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { conflictsOf } from '../sudoku/game'
import type { PhotoCrop } from '../sudoku/photo-crop'
import { cropPuzzlePhoto, openPuzzlePhoto } from '../sudoku/photo-image'
import { PhotoCropEditor } from './PhotoCropEditor'

type Photo = Awaited<ReturnType<typeof openPuzzlePhoto>>
type Review = { givens: string[]; review: Set<number>; url: string; crop: PhotoCrop }

export function PhotoPuzzleReview({ image, onBack, onCheck, onEdit, checking, checkError, visible }: {
  image: Blob
  onBack: () => void
  onCheck: (givens: string) => void
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
      const { givens, review } = await readPuzzlePhoto(pixels, work.signal)
      if (!work.signal.aborted) {
        if (automatic && givens.filter(digit => digit !== '0').length < 10) {
          setError('Only a few digits came through. Check the crop and try again.')
          return
        }
        setActiveCell(review.values().next().value ?? 0)
        setResult({ givens, review, url: canvas.toDataURL('image/jpeg', 0.93), crop: selection })
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
      const givens = [...current.givens]
      const review = new Set(current.review)
      givens[index] = digit
      review.delete(index)
      return { ...current, givens, review }
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

  const conflicts = reviewing && conflictsOf(reviewing.givens.join(''))
  return <section className="photo-import" hidden={!visible}>
    {reviewing ? <>
      <p className="sr-only" ref={instructions} tabIndex={-1}>Compare the grid with the image and correct any digits. Check highlighted cells
        and clear any player-placed digits or candidates. If the image shows extra rules, use a puzzle code or link.</p>
      <p className="sr-only" id={keyboardHelp}>Use the arrow keys to move between cells.</p>
      <div className="photo-stage">
        <div className="photo-review">
          <img src={reviewing.url} alt="Cropped puzzle image" width={576} height={576} />
          <div className="photo-edit-grid" role="group" aria-label="Edit Classic Sudoku givens" aria-describedby={keyboardHelp}>
            {reviewing.givens.map((digit, cell) => (
              <input key={cell} type="text" inputMode="numeric" autoComplete="off"
                aria-label={`Row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1}${reviewing.review.has(cell) ? ', needs review' : ''}`}
                aria-invalid={conflicts?.has(cell) || undefined}
                data-review={reviewing.review.has(cell) || undefined} data-cell={cell} tabIndex={activeCell === cell ? 0 : -1}
                disabled={checking} value={digit === '0' ? '' : digit}
                onFocus={event => { setActiveCell(cell); event.currentTarget.select() }}
                onKeyDown={event => moveCell(event, cell)}
                onChange={event => changeCell(cell, event.target.value.replace(/[^1-9]/g, '').slice(-1) || '0')} />
            ))}
          </div>
        </div>
      </div>
      {checkError && <p className="form-error" role="alert">{checkError}</p>}
      <div className="dialog-actions photo-actions">
        <Button type="button" disabled={checking}
          onClick={() => { setAdjusting(true); onEdit() }}>Adjust crop</Button>
        <Button type="button" variant="primary" disabled={checking || !reviewing.givens.some(digit => digit !== '0')}
          onClick={() => onCheck(reviewing.givens.join(''))}>{checking ? 'Checking puzzle…' : 'Preview puzzle'}</Button>
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
