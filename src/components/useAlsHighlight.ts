import { useCallback, useEffect, useMemo, useState } from 'react'
import { almostLockedSetAnnotations, findInteractingAlmostLockedSets } from '../sudoku/als-highlighting'
import { candidateCount } from '../sudoku/game'
import type { VariantPuzzle } from '../sudoku/engine'
import type { PlayGrid } from '../sudoku/grid'
import type { SizedRuleGame } from '../sudoku/sized-rule-game'

type Options = {
  gameId: string
  enabled: boolean
  available: boolean
  candidateMasks: readonly number[] | null
  values: string
  selectedDigits: number
  grid: PlayGrid
  puzzle?: VariantPuzzle
  sizedRules?: SizedRuleGame['rules']
  hidden: boolean
}

/** Owns the experimental ALS highlight capability, from its opt-in state to board annotations. */
export function useAlsHighlight({ gameId, enabled, available, candidateMasks, values, selectedDigits, grid, puzzle, sizedRules, hidden }: Options) {
  const [activeFor, setActiveFor] = useState<{ gameId: string; active: boolean } | null>(null)
  const active = enabled && activeFor?.gameId === gameId && activeFor.active
  const canHighlight = enabled && available && candidateMasks !== null && !candidateMasks.some((mask, cell) => values[cell] === '0' && !mask)

  useEffect(() => {
    if (!enabled) setActiveFor(null)
  }, [enabled])

  const toggle = useCallback(() => {
    setActiveFor(current => ({ gameId, active: !(enabled && current?.gameId === gameId && current.active) }))
  }, [enabled, gameId])

  const groups = useMemo(() => !active || !canHighlight || hidden || !candidateMasks
    ? [] : findInteractingAlmostLockedSets({ values, candidates: candidateMasks, selectedDigits, grid, puzzle, sizedRules }),
  [active, canHighlight, hidden, candidateMasks, values, selectedDigits, grid, puzzle, sizedRules])
  const annotations = useMemo(() => almostLockedSetAnnotations(groups), [groups])

  return { active, available: canHighlight, annotations, toggle }
}

export function canSelectAlsHighlight(selectedDigits: number, gridSize = 9) {
  const validDigits = selectedDigits & ((1 << gridSize) - 1)
  return candidateCount(validDigits) > 1
}
