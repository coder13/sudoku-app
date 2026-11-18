import type { DeductionAction } from './engine.ts'
import { marksOf, peer, type Game } from './game.ts'

export function practiceActions(initial: Game, game: Game): DeductionAction[] {
  const placements: { place: { cell: number; digit: number } }[] = []
  const removals: DeductionAction[] = []
  const { entries, center, corner } = game.position
  for (let cell = 0; cell < entries.length; cell++) {
    if (entries[cell] !== '0') placements.push({ place: { cell, digit: Number(entries[cell]) } })
  }
  for (let cell = 0; cell < entries.length; cell++) {
    if (initial.givens[cell] !== '0' || entries[cell] !== '0') continue
    const removed = initial.position.corner[cell] & ~(center[cell] | corner[cell])
    for (const digit of marksOf(removed)) {
      // Entering a digit clears it from its peers, without proposing an extra move.
      if (!placements.some(({ place }) => place.digit === digit && peer(place.cell, cell))) {
        removals.push({ eliminate: { cell, digit } })
      }
    }
  }
  return [...placements, ...removals]
}
