import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { conflictsOf } from '../sudoku/game'
import { MIN_GRID_SIZE, type GridCrop } from '../sudoku/photo-grid'
import { cropPuzzlePhoto, openPuzzlePhoto } from '../sudoku/photo-image'

type Photo = Awaited<ReturnType<typeof openPuzzlePhoto>>
type Review = { givens: string[]; review: Set<number>; url: string }
const CROP_EDGES = ['left', 'top', 'right', 'bottom'] as const

function CropControls({ photo, crop, setCrop, disabled }: {
  photo: Photo; crop: GridCrop; setCrop: (crop: GridCrop) => void; disabled: boolean
}) {
  const { width, height } = photo.canvas
  const limits = {
    left: [0, crop.right - MIN_GRID_SIZE],
    top: [0, crop.bottom - MIN_GRID_SIZE],
    right: [crop.left + MIN_GRID_SIZE, width],
    bottom: [crop.top + MIN_GRID_SIZE, height],
  }
  return <>
    <div className="photo-crop-image">
      <img src={photo.url} width={width} height={height} alt="Selected puzzle image" />
      <div className="photo-crop-frame" aria-hidden="true" style={{
        left: `${crop.left / width * 100}%`, top: `${crop.top / height * 100}%`,
        right: `${(width - crop.right) / width * 100}%`, bottom: `${(height - crop.bottom) / height * 100}%`,
      }} />
    </div>
    <details className="photo-crop-controls" open={!photo.detected || undefined}>
      <summary>Adjust crop</summary>
      <div className="photo-crop-edges">
        {CROP_EDGES.map(edge => (
          <label key={edge}>{edge} edge
            <input type="range" min={limits[edge][0]} max={limits[edge][1]} value={crop[edge]}
              disabled={disabled} onChange={event => setCrop({ ...crop, [edge]: event.target.valueAsNumber })} />
          </label>
        ))}
      </div>
    </details>
  </>
}

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
  const [crop, setCrop] = useState<GridCrop>()
  const [result, setResult] = useState<Review>()
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [activeCell, setActiveCell] = useState(0)
  const pending = useRef<AbortController | null>(null)
  const instructions = useRef<HTMLParagraphElement>(null)
  const keyboardHelp = useId()
  const hasPhoto = Boolean(photo)
  const reviewing = Boolean(result)

  useEffect(() => {
    let closed = false
    void openPuzzlePhoto(image).then(opened => {
      if (closed) return
      setPhoto(opened)
      setCrop(opened.crop)
    }, reason => {
      if (!closed) setError(reason instanceof Error ? reason.message : 'The image could not be opened.')
    })
    return () => {
      closed = true
      pending.current?.abort()
    }
  }, [image])

  useEffect(() => {
    if (visible && hasPhoto) instructions.current?.focus()
  }, [visible, hasPhoto, reviewing])

  async function scan() {
    if (!photo || !crop || pending.current) return
    const work = new AbortController()
    pending.current = work
    setError('')
    setReading(true)
    try {
      const { canvas, pixels } = cropPuzzlePhoto(photo.canvas, crop)
      const { readPuzzlePhoto } = await import('../sudoku/photo-ocr')
      const { givens, review } = await readPuzzlePhoto(pixels, work.signal)
      if (!work.signal.aborted) {
        setActiveCell(review.values().next().value ?? 0)
        setResult({ givens, review, url: canvas.toDataURL('image/jpeg', 0.93) })
      }
    } catch (reason) {
      if (!work.signal.aborted) setError(reason instanceof Error ? reason.message : 'The image could not be read.')
    } finally {
      pending.current = null
      if (!work.signal.aborted) setReading(false)
    }
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

  const conflicts = result && conflictsOf(result.givens.join(''))
  return <section className="photo-import" hidden={!visible}>
    {result ? <>
      <p ref={instructions} tabIndex={-1}>Compare the grid with the image and correct any digits. Check highlighted cells
        and clear any player-placed digits or candidates. If the image shows extra rules, use a puzzle code or link.</p>
      <p className="sr-only" id={keyboardHelp}>Use the arrow keys to move between cells.</p>
      <div className="photo-review">
        <img src={result.url} alt="Cropped puzzle image" width={576} height={576} />
        <div className="photo-edit-grid" role="group" aria-label="Edit Classic Sudoku givens" aria-describedby={keyboardHelp}>
          {result.givens.map((digit, cell) => (
            <input key={cell} type="text" inputMode="numeric" autoComplete="off"
              aria-label={`Row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1}${result.review.has(cell) ? ', needs review' : ''}`}
              aria-invalid={conflicts?.has(cell) || undefined}
              data-review={result.review.has(cell) || undefined} data-cell={cell} tabIndex={activeCell === cell ? 0 : -1}
              disabled={checking} value={digit === '0' ? '' : digit}
              onFocus={event => { setActiveCell(cell); event.currentTarget.select() }}
              onKeyDown={event => moveCell(event, cell)}
              onChange={event => changeCell(cell, event.target.value.replace(/[^1-9]/g, '').slice(-1) || '0')} />
          ))}
        </div>
      </div>
      {checkError && <p className="form-error" role="alert">{checkError}</p>}
      <div className="dialog-actions photo-actions">
        <button type="button" className="button secondary" disabled={checking}
          onClick={() => { setResult(undefined); onEdit() }}>Change crop</button>
        <button type="button" className="button primary" disabled={checking || !result.givens.some(digit => digit !== '0')}
          onClick={() => onCheck(result.givens.join(''))}>{checking ? 'Checking puzzle…' : 'Preview puzzle'}</button>
      </div>
    </> : <>
      {photo && crop && <>
        <p ref={instructions} tabIndex={-1}>{photo.detected ? 'Make sure the crop matches the full 9 × 9 grid.'
          : 'A grid was not detected. Adjust the crop around the full 9 × 9 grid or try a clearer image.'}</p>
        <CropControls photo={photo} crop={crop} setCrop={setCrop} disabled={reading} />
      </>}
      {!photo && !error && <p role="status">Opening image…</p>}
      {reading && <p role="status">Reading digits…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions photo-actions">
        <button type="button" className="button secondary" onClick={onBack}>Choose another source</button>
        {photo && <button type="button" className="button primary" onClick={() => void scan()} disabled={reading}>Read digits</button>}
      </div>
    </>}
  </section>
}
