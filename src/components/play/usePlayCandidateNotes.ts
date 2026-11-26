import { useCallback, useEffect, useState } from 'react'
import type { Game } from '../../sudoku/game'
import { createEngineSession, type EngineRunner } from '../../sudoku/engine'
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

const CANDIDATE_TIMEOUT_MS = 15_000

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
  const [retryVersion, setRetryVersion] = useState(0)
  const retry = useCallback(() => {
    setNotes(undefined)
    setRetryVersion(version => version + 1)
  }, [])

  useEffect(() => {
    if (draft || solved || game.paused) return
    let current = true
    const abort = new AbortController()
    const engine = createEngineSession()
    const timeout = setTimeout(() => abort.abort(new DOMException('Candidate calculation timed out.', 'TimeoutError')),
      CANDIDATE_TIMEOUT_MS)
    const run: EngineRunner = (request, options) => engine.run(request, {
      ...options, signal: abort.signal,
    })

    void playCandidates(game, run, generateCandidateVariants).then(masks => {
      if (current) setNotes({ gameId: game.id, values, eliminations: game.position.eliminations,
        variant: game.variant, algebraic: game.algebraic, sized: game.sized, masks })
    }).catch(() => {
      if (current) setNotes({ gameId: game.id, values, eliminations: game.position.eliminations,
        variant: game.variant, algebraic: game.algebraic, sized: game.sized, masks: null, failed: true })
    }).finally(() => {
      clearTimeout(timeout)
    })

    return () => {
      current = false
      clearTimeout(timeout)
      abort.abort()
      engine.close()
    }
  }, [game.id, draft, solved, game.paused, values, game.variant, game.algebraic, game.sized, game.grid,
    game.position.eliminations, generateCandidateVariants, retryVersion])

  return { notes, retry }
}
