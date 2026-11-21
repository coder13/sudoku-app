import { solveLatin } from '../latin/engine.ts'
import { createFutoshiki, type Inequality } from './engine.ts'
import type { FutoshikiEntry } from './catalog.ts'

const difficultyBySize = { 4: 'easy', 5: 'medium', 6: 'hard' } as const
const importToken = /^f1\.([0-6]{16}|[0-6]{25}|[0-6]{36})\.([0-9a-z]{0,120})$/

export type FutoshikiSize = keyof typeof difficultyBySize

export function isFutoshikiSize(value: unknown): value is FutoshikiSize {
  return value === 4 || value === 5 || value === 6
}

export function createImportedFutoshiki(size: FutoshikiSize, givens: string, inequalities: readonly Inequality[]): FutoshikiEntry {
  const puzzle = createFutoshiki(size, Array.from(givens, Number), inequalities)
  const encoded = inequalities
    .map(({ less, greater }) => less.toString(36) + greater.toString(36))
    .sort().join('')
  return { id: `f1.${givens}.${encoded}`, puzzle, number: 0, difficulty: difficultyBySize[size], imported: true }
}

export function verifiedImportedFutoshiki(entry: FutoshikiEntry) {
  const result = solveLatin(entry.puzzle)
  if (result.status === 'unsolvable') throw new Error('This Futoshiki puzzle has no solution.')
  if (result.status === 'multiple') throw new Error('This Futoshiki puzzle has more than one solution.')
  if (result.status === 'search-limit') throw new Error('The app could not check whether this Futoshiki puzzle has one solution.')
  return entry
}

export function importedFutoshikiToken(value: unknown) {
  return typeof value === 'string' && value.length <= 161 && importToken.test(value) ? value : undefined
}

export function readImportedFutoshiki(token: string): FutoshikiEntry | undefined {
  if (!importedFutoshikiToken(token)) return
  const [, givens, edges] = importToken.exec(token)!
  const size = Math.sqrt(givens.length)
  if (!isFutoshikiSize(size) || edges.length % 2) return
  const inequalities: Inequality[] = []
  for (let index = 0; index < edges.length; index += 2) {
    inequalities.push({ less: Number.parseInt(edges[index], 36), greater: Number.parseInt(edges[index + 1], 36) })
  }
  try {
    const entry = createImportedFutoshiki(size, givens, inequalities)
    if (entry.id === token) return entry
  } catch { /* Invalid givens or inequality edges. */ }
}
