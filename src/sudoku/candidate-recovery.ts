import type { Candidate, Difficulty, VariantHouse } from './engine.ts'
import { DIGITS, hasCandidate, move, onlyCandidate, peer, valuesOf, type Game } from './game.ts'
import { cellReference, type CellReferenceStyle } from './hints.ts'
import { variantHouseCells, variantHouseMasks, variantHouseName } from './variants.ts'

export type CandidateRecovery = Candidate & { layout: 'center' | 'corner'; movesAgo?: number }

export function findCandidateRecovery(game: Game, solution: string, removals: readonly number[]): CandidateRecovery | undefined {
  const values = valuesOf(game)
  if (!/^[1-9]{81}$/.test(solution) || [...values].some((digit, cell) => digit !== '0' && digit !== solution[cell])) return

  const cell = removals.findIndex((mask, index) => values[index] === '0' && hasCandidate(mask, Number(solution[index])))
  if (cell < 0) return

  const digit = Number(solution[cell])
  const { center, corner } = game.position
  const layout = center[cell] && !corner[cell] ? 'center' : 'corner'
  for (let index = game.past.length - 1; index >= 0; index--) {
    const before = game.past[index]
    if (before.entries[cell] !== '0') break
    if (hasCandidate(before.eliminations?.[cell] ?? 0, digit)) continue
    const after = game.past[index + 1] ?? game.position
    const wasInCenter = hasCandidate(before.center[cell], digit)
    const wasInCorner = hasCandidate(before.corner[cell], digit)
    if (wasInCenter || wasInCorner || hasCandidate(after.eliminations?.[cell] ?? 0, digit)) {
      return { cell, digit, layout: wasInCenter ? 'center' : wasInCorner ? 'corner' : layout, movesAgo: game.past.length - index }
    }
  }
  return { cell, digit, layout }
}

export function restoreCandidate(game: Game, { cell, digit, layout }: CandidateRecovery): Game {
  if (game.givens[cell] !== '0' || game.position.entries[cell] !== '0') return game
  const { center, corner, eliminations } = game.position
  const displayed = hasCandidate(center[cell] | corner[cell], digit)
  const eliminated = hasCandidate(eliminations?.[cell] ?? 0, digit)
  if (displayed && !eliminated) return game

  const position = { ...game.position }
  if (eliminations && eliminated) {
    position.eliminations = [...eliminations]
    position.eliminations[cell] &= ~(1 << (digit - 1))
  }
  if (!displayed) {
    position[layout] = [...position[layout]]
    position[layout][cell] |= 1 << (digit - 1)
  }
  return move(game, position)
}

const houses: VariantHouse[] = DIGITS.flatMap((digit) => [{ row: digit - 1 }, { column: digit - 1 }, { region: digit - 1 }])
const list = new Intl.ListFormat('en')

export function explainCandidateRecovery(game: Game, candidate: Candidate, style: CellReferenceStyle): string {
  const reference = (cell: number) => cellReference(cell, style, game.difficulty ?? undefined)
  const { cell, digit } = candidate
  const fallback = `The solution uses ${digit} in ${reference(cell)}. Restore that candidate.`
  if (game.variant) return fallback

  const values = valuesOf(game)
  const puzzle = { version: 1, givens: values } as const
  const alternative = onlyCandidate(variantHouseMasks(puzzle, values)[cell] & ~(1 << (digit - 1)))
  if (alternative === null) return fallback

  const trial = values.slice(0, cell) + alternative + values.slice(cell + 1)
  const masks = variantHouseMasks(puzzle, trial)
  const singles = masks.map(onlyCandidate)
  for (const house of houses) {
    const cells = variantHouseCells(house, puzzle)
    if (cells.some((index) => trial[index] === String(digit))) continue
    // Each candidate for the required digit must see an independently forced placement.
    const blockers = cells.filter((index) => hasCandidate(masks[index], digit))
      .map((index) => singles.findIndex((single, other) => single === digit && !cells.includes(other) && peer(index, other)))
    const placements = [...new Set(blockers)]
    if (placements.includes(-1) || placements.length > 2) continue

    const assumption = `Suppose ${reference(cell)} is ${alternative}.`
    const result = `That leaves no place for ${digit} in ${variantHouseName(house, puzzle)}`
    if (!placements.length) return `${assumption} ${result}. ${reference(cell)} needs ${digit}.`
    const forced = list.format(placements.map(reference))
    return `${assumption} This forces ${digit} in ${forced}. ${result}. ${reference(cell)} needs ${digit}.`
  }
  return fallback
}
