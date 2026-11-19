import { useEffect } from 'react'
import { applyActionMatches, matchActionBatch, pendingActionBatch } from '../sudoku/action-history'
import { actionHistoryMatcher } from '../sudoku/action-history-matcher'
import type { Game } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'

export function useActionHistory(game: Game) {
  useEffect(() => {
    const batch = pendingActionBatch(game.actionHistory ?? [], Date.now())
    if (!batch) return
    let current = true
    const timer = setTimeout(() => {
      void matchActionBatch(batch.entries, actionHistoryMatcher(game.variant)).then((matches) => {
        if (current) roomStore.update(game.id, (latest) => applyActionMatches(latest, batch.entries, matches), { derived: true })
      })
    }, batch.delay)
    return () => { current = false; clearTimeout(timer) }
  }, [game.id, game.actionHistory, game.variant])
}
