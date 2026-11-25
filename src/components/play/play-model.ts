import type { Deduction } from '../../sudoku/engine'
import { hasCandidate, type Game, type Position } from '../../sudoku/game'
import { addRatingHints } from '../../sudoku/player-rating'

export type CandidateDigitColorSummary = {
  candidateCount: number
  colors: readonly { color: number; count: number }[]
}

/** Summarize visible painted occurrences without collapsing mixed shades to "unpainted". */
export function candidateDigitColorSummaries({ values, masks, colors, gridSize, visibleCells }: {
  values: string
  masks: readonly number[] | null
  colors: Position['candidateColors']
  gridSize: number
  visibleCells?: ReadonlySet<number>
}): CandidateDigitColorSummary[] {
  return Array.from({ length: gridSize }, (_, index) => {
    const shades = new Map<number, number>()
    let candidateCount = 0
    for (let cell = 0; cell < (masks?.length ?? 0); cell++) {
      if (values[cell] !== '0' || visibleCells && !visibleCells.has(cell) || !hasCandidate(masks?.[cell] ?? 0, index + 1)) continue
      candidateCount++
      const color = colors?.[cell]?.[index + 1]
      if (color && color > 0) shades.set(color, (shades.get(color) ?? 0) + 1)
    }
    return { candidateCount, colors: [...shades].map(([color, count]) => ({ color, count })) }
  })
}

export function candidateToolMasks(
  notes: readonly number[] | null | undefined,
  values: string,
  displayed: readonly number[] | null,
  eliminations?: readonly number[],
) {
  return notes?.map((mask, cell) => values[cell] === '0'
    ? mask & (displayed?.[cell] ?? mask) & ~(eliminations?.[cell] ?? 0) : 0) ?? null
}

export function isAltClick(event: Pick<MouseEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>) {
  return event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey
}

export function isChainStep(step?: Deduction) {
  if (!step) return false
  const { evidence, technique } = step
  return 'chain' in evidence || 'inference' in evidence || 'single-digit-chain' in evidence || 'coloring' in evidence || 'multi-coloring' in evidence ||
    ['forcing-chain', 'als-chain', 'sk-loop'].includes(technique)
}

export function withRatingHints(game: Game, keys: readonly string[], applied = false, request?: Parameters<typeof addRatingHints>[3]): Game {
  if (!game.ratingAttempt) return game
  const ratingAttempt = addRatingHints(game.ratingAttempt, keys, applied, request)
  return ratingAttempt === game.ratingAttempt ? game : { ...game, ratingAttempt }
}

