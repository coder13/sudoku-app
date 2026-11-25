import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCollectionGrid } from '../../sudoku/collection-downloads'
import { openCollectionPuzzle } from '../../sudoku/collection-play'
import type { CollectionPuzzleInfo, PuzzleCollection } from '../../sudoku/collections'
import { roomStore } from '../../sudoku/storage'

type Options = {
  collection?: PuzzleCollection
  puzzle?: CollectionPuzzleInfo
  online: boolean
  savedGrid?: string
}

/** Own preview fetching and save/play requests for the selected collection puzzle. */
export function useCollectionPuzzleActions({ collection, puzzle, online, savedGrid }: Options) {
  const [message, setMessage] = useState('')
  const [opening, setOpening] = useState(false)
  const [preview, setPreview] = useState<{ key: string; grid?: string; error?: string }>()
  const [previewAttempt, setPreviewAttempt] = useState(0)
  const openRequest = useRef<AbortController | null>(null)
  const previewKey = collection && puzzle ? `${collection.id}:${puzzle.id}` : undefined

  useEffect(() => () => openRequest.current?.abort(), [])
  useEffect(() => {
    if (!collection || !puzzle || !previewKey || !online || savedGrid) return
    const request = new AbortController()
    setPreview({ key: previewKey })
    void fetchCollectionGrid(collection, puzzle, request.signal)
      .then(grid => {
        if (!request.signal.aborted) setPreview({ key: previewKey, grid })
      })
      .catch(reason => {
        if (!request.signal.aborted) setPreview({ key: previewKey, error: reason instanceof Error ? reason.message : 'This puzzle could not load.' })
      })
    return () => request.abort()
  }, [collection, puzzle, previewKey, online, savedGrid, previewAttempt])

  const previewGrid = preview?.key === previewKey ? preview?.grid : undefined
  const previewError = preview?.key === previewKey ? preview?.error : undefined

  const openPuzzle = useCallback(async (puzzleId: string, play: boolean) => {
    if (!collection || openRequest.current) return
    const request = new AbortController()
    openRequest.current = request
    setOpening(true)
    setMessage('')
    try {
      const { added } = await openCollectionPuzzle(collection.id, puzzleId, {
        online,
        play,
        preview: previewGrid,
        signal: request.signal,
      })
      if (request.signal.aborted || play) return
      setMessage(
        !roomStore.getSnapshot().storageAvailable
          ? 'Puzzle available for this session. Local storage is unavailable.'
          : added
            ? 'Puzzle saved for later.'
            : 'This puzzle is already in Your puzzles.'
      )
    } catch (reason) {
      if (!request.signal.aborted) setMessage(reason instanceof Error ? reason.message : 'This puzzle could not be opened.')
    } finally {
      openRequest.current = null
      setOpening(false)
    }
  }, [collection, online, previewGrid])

  const retryPreview = useCallback(() => setPreviewAttempt(attempt => attempt + 1), [])
  return { message, opening, previewGrid, previewError, retryPreview, openPuzzle }
}
