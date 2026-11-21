import { useEffect, useRef } from 'react'
import { applyActionMatches, type ActionHistoryEntry } from '../sudoku/action-history'
import { createClassificationScope } from '../sudoku/action-classification'
import { actionHistoryMatcher } from '../sudoku/action-history-matcher'
import { createActionHistoryQueue } from '../sudoku/action-history-queue'
import { puzzleIdentity, type Game } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'

type HistoryWork = {
  readers: number
  queue: ReturnType<typeof createActionHistoryQueue>
}
const histories = new Map<string, HistoryWork>()

function watchHistory(game: Game, key: string) {
  let work = histories.get(key)
  if (!work) {
    const identity = puzzleIdentity(game)
    const queue = createActionHistoryQueue(() => {
      const scope = createClassificationScope()
      return { match: actionHistoryMatcher(game.variant, scope.run, game.grid, game.sized), close: scope.close }
    }, (entries, matches) => {
      roomStore.update(game.id, latest => puzzleIdentity(latest) === identity
        ? applyActionMatches(latest, entries, matches) : latest, { derived: true })
      const latest = roomStore.getSnapshot().games.find(item => item.id === game.id)
      return latest && puzzleIdentity(latest) === identity ? latest.actionHistory ?? [] : []
    })
    work = { readers: 0, queue }
    histories.set(key, work)
  }
  const watched = work
  watched.readers++
  let closed = false
  return {
    update(history: readonly ActionHistoryEntry[]) {
      if (closed) return
      watched.queue.update(history)
    },
    close() {
      if (closed) return
      closed = true
      if (--watched.readers > 0) return
      watched.queue.close()
      histories.delete(key)
    },
  }
}

export function useActionHistory(game: Game) {
  const key = JSON.stringify([game.id, puzzleIdentity(game)])
  const current = useRef<ReturnType<typeof watchHistory> | null>(null)
  useEffect(() => {
    const watched = watchHistory(game, key)
    current.current = watched
    return () => { watched.close(); if (current.current === watched) current.current = null }
  }, [key])
  useEffect(() => { current.current?.update(game.actionHistory ?? []) }, [key, game.actionHistory])
}
