import { useEffect, useRef, useState } from 'react'
import type { Game } from '../../sudoku/game'
import { runEngine, type EngineRunner } from '../../sudoku/engine'
import { playCandidates } from '../../sudoku/variant-play'
import type { AdvancedModes } from '../../sudoku/preferences'

export type PlayCandidateNotes = {
  gameId: string
  values: string
  eliminations: Game['position']['eliminations']
  variant?: Game['variant']
  algebraic?: Game['algebraic']
  sized?: Game['sized']
  masks: number[] | null
  failed?: boolean
}

type Options = {
  game: Game
  values: string
  generateCandidateVariants?: AdvancedModes['generateCandidateVariants']
  draft: boolean
  solved: boolean
}

/** Keep solver-derived candidate notes tied to the puzzle position they describe. */
export function usePlayCandidateNotes({ game, values, generateCandidateVariants, draft, solved }: Options) {
  const [notes, setNotes] = useState<PlayCandidateNotes>()
  const latestKey = useRef({})

  useEffect(() => {
    if (draft || solved || game.paused) return
    let current = true
    const abort = new AbortController()
    const run: EngineRunner = (request, options) => runEngine(request, {
      ...options, latestKey: latestKey.current, signal: abort.signal,
    })

    void playCandidates(game, run, generateCandidateVariants).then(masks => {
      if (current) setNotes({ gameId: game.id, values, eliminations: game.position.eliminations,
        variant: game.variant, algebraic: game.algebraic, sized: game.sized, masks })
    }).catch(() => {
      if (current) setNotes({ gameId: game.id, values, eliminations: game.position.eliminations,
        variant: game.variant, algebraic: game.algebraic, sized: game.sized, masks: null, failed: true })
    })

    return () => {
      current = false
      abort.abort()
    }
  }, [game.id, draft, solved, game.paused, values, game.variant, game.algebraic, game.sized, game.grid,
    game.position.eliminations, generateCandidateVariants])

  return notes
}
