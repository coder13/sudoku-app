import { useEffect, useRef, useState } from 'react'
import { createEngineSession } from '../sudoku/engine'
import { hasUniquenessProof } from '../sudoku/game'
import { MAX_IMPORT_LENGTH, type ImportedPuzzle } from '../sudoku/puzzle-import'
import { PuzzleVerificationError, type PhotoProgress, type PuzzlePreview } from '../sudoku/puzzle-preview'
import { applyPuzzleGrade, ratePuzzle } from '../sudoku/puzzle-rating'
import type { Dispatch, SetStateAction } from 'react'
import type { PhotoImportOptions } from './PhotoPuzzleReview'

export type PreviewProgress = {
  signal: AbortSignal
  onDecoded: (puzzle: ImportedPuzzle) => void
  photoProgress?: PhotoProgress
}

type PreviewRequest = (input: string, progress: PreviewProgress) => Promise<PuzzlePreview>

/** Own asynchronous decoding, verification, cancellation, and rating for an import preview. */
export function usePuzzleImportPreview(onPreview: PreviewRequest) {
  const pending = useRef<AbortController | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<PuzzlePreview>()
  const [decoded, setDecoded] = useState<ImportedPuzzle>()
  const [verificationError, setVerificationError] = useState<PuzzleVerificationError['status']>()

  useEffect(() => () => pending.current?.abort(), [])

  useEffect(() => {
    if (!preview?.ratingPending) return
    const engine = createEngineSession()
    const { game } = preview
    let current = true
    void ratePuzzle(game.givens, game.variant, engine.run, game.nonUnique,
      Boolean(game.variant && hasUniquenessProof(game)))
      .then((grade) => {
        if (current)
          setPreview((latest) =>
            latest === preview
              ? { ...preview, game: applyPuzzleGrade(game, grade), grade, ratingPending: undefined }
              : latest
          )
      })
      .catch(() => {
        if (current) setPreview((latest) => (latest === preview ? { ...preview, ratingPending: undefined } : latest))
      })
      .finally(() => engine.close())
    return () => {
      current = false
      engine.close()
    }
  }, [preview])

  async function check(source: string | File, fromPhoto?: PhotoImportOptions, manualEntry = false) {
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
        onDecoded: (puzzle) => {
          if (!work.signal.aborted) setDecoded(puzzle)
        },
        photoProgress: fromPhoto?.progress,
      })
      if (!work.signal.aborted) {
        setPreview(
          fromPhoto
            ? { ...result, format: 'Photo or screenshot', startFresh: fromPhoto.startFresh }
            : manualEntry
              ? { ...result, format: 'Manual entry' }
              : result
        )
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

  function changeInput(value: string) {
    setInput(value)
    setError('')
    setStatus('')
  }

  function resetPreview() {
    pending.current?.abort()
    pending.current = null
    setBusy(false)
    setError('')
    setPreview(undefined)
    setDecoded(undefined)
    setVerificationError(undefined)
  }

  return {
    input,
    setInput,
    changeInput,
    busy,
    error,
    setError,
    clearError: () => setError(''),
    status,
    setStatus,
    preview,
    setPreview,
    decoded,
    verificationError,
    check,
    resetPreview,
  } satisfies {
    input: string
    setInput: Dispatch<SetStateAction<string>>
    changeInput: (value: string) => void
    busy: boolean
    error: string
    setError: Dispatch<SetStateAction<string>>
    clearError: () => void
    status: string
    setStatus: Dispatch<SetStateAction<string>>
    preview: PuzzlePreview | undefined
    setPreview: Dispatch<SetStateAction<PuzzlePreview | undefined>>
    decoded: ImportedPuzzle | undefined
    verificationError: PuzzleVerificationError['status'] | undefined
    check: (source: string | File, fromPhoto?: PhotoImportOptions, manualEntry?: boolean) => Promise<void>
    resetPreview: () => void
  }
}
