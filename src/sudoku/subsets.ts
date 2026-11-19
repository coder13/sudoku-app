import { candidateCount, hasCandidate, marksOf } from './game.ts'
import type { Candidate, House, VariantPuzzle } from './engine.ts'
import { CLASSIC_GRID, gridHouseCells, type PlayGrid } from './grid.ts'
import { variantHouseCells } from './variants.ts'

export type SubsetKind = 'hidden' | 'naked'
export const SUBSET_SCOPES = ['row', 'column', 'box'] as const
export type SubsetScope = typeof SUBSET_SCOPES[number]
type Subset = { cells: number[]; digits: number[]; removals: Candidate[] }

export function subsetHouseCells(house: House, grid: PlayGrid = CLASSIC_GRID, puzzle?: VariantPuzzle) {
  return puzzle ? variantHouseCells('box' in house ? { region: house.box } : house, puzzle) : gridHouseCells(house, grid)
}

export function sharedSubsetHouses(cells: readonly number[], grid: PlayGrid = CLASSIC_GRID, puzzle?: VariantPuzzle): Partial<Record<SubsetScope, House>> {
  const [first] = cells
  if (first === undefined) return {}
  const row = Math.floor(first / grid.size)
  const column = first % grid.size
  const box = puzzle?.regions?.type === 'jigsaw'
    ? puzzle.regions.regions.findIndex((region) => region.includes(first))
    : Math.floor(row / grid.boxRows) * (grid.size / grid.boxColumns) + Math.floor(column / grid.boxColumns)
  const candidates = { row: { row }, column: { column }, box: { box } }
  const houses: Partial<Record<SubsetScope, House>> = {}
  for (const scope of SUBSET_SCOPES) {
    if (scope === 'box' && box < 0) continue
    const house = candidates[scope]
    const members = subsetHouseCells(house, grid, puzzle)
    if (cells.every((cell) => members.includes(cell))) houses[scope] = house
  }
  return houses
}

export function digitLocations(cells: readonly number[], masks: readonly number[], digit: number) {
  return cells.filter((cell) => hasCandidate(masks[cell], digit))
}

export function selectedDigits(cells: readonly number[], masks: readonly number[]) {
  return marksOf(cells.reduce((combined, cell) => combined | masks[cell], 0))
}

function* combinations<T>(items: readonly T[], size: number, prefix: T[] = []): Generator<T[]> {
  if (size === 0) {
    yield prefix
    return
  }
  for (let index = 0; index <= items.length - size; index++) {
    yield* combinations(items.slice(index + 1), size - 1, [...prefix, items[index]])
  }
}

export function findHouseSubsets(house: readonly number[], masks: readonly number[], kind: SubsetKind): Subset[] {
  const empty = house.filter((cell) => masks[cell] !== 0)
  const available = selectedDigits(empty, masks)
  const byDigit = new Map(available.map((digit) => [digit, digitLocations(empty, masks, digit)]))
  const matches: Subset[] = []
  const nakedCells = empty.filter((cell) => candidateCount(masks[cell]) > 1)
  const hiddenDigits = available.filter((digit) => byDigit.get(digit)!.length > 1)

  for (let size = 2; size <= 4 && size < empty.length; size++) {
    if (kind === 'naked') {
      for (const cells of combinations(nakedCells, size)) {
        const digits = selectedDigits(cells, masks)
        if (digits.length !== size) continue
        const removals = empty.filter((cell) => !cells.includes(cell))
          .flatMap((cell) => digits.filter((digit) => hasCandidate(masks[cell], digit)).map((digit) => ({ cell, digit })))
        if (removals.length) matches.push({ cells, digits, removals })
      }
    } else {
      for (const digits of combinations(hiddenDigits, size)) {
        const cells = [...new Set(digits.flatMap((digit) => byDigit.get(digit)!))]
        if (cells.length !== size) continue
        const removals = cells.flatMap((cell) => marksOf(masks[cell]).filter((digit) => !digits.includes(digit))
          .map((digit) => ({ cell, digit })))
        if (removals.length) matches.push({ cells, digits, removals })
      }
    }
  }
  return matches
}
