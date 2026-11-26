import { useEffect, useMemo, useState } from 'react'
import { createEngineSession } from '../../sudoku/engine'
import type { ErrorMode, Game } from '../../sudoku/game'
import { solveMini } from '../../sudoku/mini-play'

/** Resolve solution-based error marks and combine them with the configured board error mode. */
export function usePlayErrorModel({ game, errorMode, conflicts, values, draft }: {
  game: Game
  errorMode: ErrorMode
  conflicts: ReadonlySet<number>
  values: string
  draft: boolean
}) {
  const [solution, setSolution] = useState<string | null>(null)
  const showSolutionErrors = errorMode === 'all' || errorMode === 'incorrect'
  const { givens, variant, algebraic, sized, grid, nonUnique } = game

  useEffect(() => {
    let current = true
    const engine = createEngineSession()
    setSolution(showSolutionErrors ? sized?.solution ?? algebraic?.solution ?? variant?.solution ?? null : null)
    if (!draft && !game.paused && showSolutionErrors && !variant && !algebraic && !sized) {
      void (grid ? solveMini(givens, engine.run) : engine.run({ type: 'solve', values: givens }))
        .then(result => { if (current) setSolution(result) })
        .catch(() => { /* Conflict checking remains available if the solver cannot load a solution. */ })
        .finally(() => engine.close())
    }
    return () => { current = false; engine.close() }
  }, [algebraic, draft, game.paused, givens, grid, showSolutionErrors, sized, variant])

  const errors = useMemo(() => {
    const result = new Set<number>()
    if (errorMode === 'none' || draft) return result
    if (errorMode === 'conflicts') return conflicts
    if (errorMode === 'all') conflicts.forEach(cell => result.add(cell))
    if (showSolutionErrors && solution && !nonUnique) {
      for (let cell = 0; cell < game.position.entries.length; cell++) {
        if (game.position.entries[cell] !== '0' && values[cell] !== solution[cell]) result.add(cell)
      }
    }
    return result
  }, [conflicts, draft, errorMode, game.position.entries, nonUnique, showSolutionErrors, solution, values])

  return { errors }
}
