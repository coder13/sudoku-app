import { useCallback } from 'react'
import { recordAction, type ActionKind } from '../../sudoku/action-history'
import { createPuzzleBookmark, puzzleIdentity, restorePuzzleBookmark, type Game } from '../../sudoku/game'
import { roomStore } from '../../sudoku/storage'

type Options = {
  game: Game
  savedGame: Game
  session: boolean
  showResults: boolean
  edit: (transform: (current: Game) => Game, kind?: ActionKind) => void
  openSolvedGrid: (position?: Game) => void
  focusGridAfterHistory: () => void
}

/** Own Play bookmark persistence and restore policy; the host supplies its edit and focus boundaries. */
export function usePlayBookmarkActions({
  game,
  savedGame,
  session,
  showResults,
  edit,
  openSolvedGrid,
  focusGridAfterHistory,
}: Options) {
  const saveBookmark = useCallback((name: string) => {
    const bookmark = createPuzzleBookmark({ ...game, bookmarks: savedGame.bookmarks }, name)
    const identity = puzzleIdentity(game)
    roomStore.update(game.id, (current) =>
      current.source !== 'draft' && puzzleIdentity(current) === identity && !current.bookmarks?.some((item) => item.id === bookmark.id)
        ? { ...current, bookmarks: [bookmark, ...(current.bookmarks ?? [])] }
        : current
    )
  }, [game, savedGame.bookmarks])

  const deleteBookmark = useCallback((bookmarkId: string) => {
    roomStore.update(game.id, (current) => {
      if (!current.bookmarks) return current
      const bookmarks = current.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId)
      return bookmarks.length === current.bookmarks.length ? current : { ...current, bookmarks: bookmarks.length ? bookmarks : undefined }
    })
  }, [game.id])

  const restoreBookmark = useCallback((bookmarkId: string) => {
    if (session || showResults) {
      const bookmark = savedGame.bookmarks?.find((item) => item.id === bookmarkId)
      if (!bookmark) return
      if (session) edit((current) => restorePuzzleBookmark(current, bookmark), 'bookmark')
      else {
        const next = restorePuzzleBookmark(savedGame, bookmark)
        focusGridAfterHistory()
        openSolvedGrid(recordAction(savedGame, next, 'bookmark'))
      }
    } else {
      edit((current) => {
        const bookmark = current.bookmarks?.find((item) => item.id === bookmarkId)
        return bookmark && !current.paused ? restorePuzzleBookmark(current, bookmark) : current
      }, 'bookmark')
    }
  }, [edit, focusGridAfterHistory, openSolvedGrid, savedGame, session, showResults])

  return { saveBookmark, deleteBookmark, restoreBookmark }
}
