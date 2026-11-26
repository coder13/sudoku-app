import { COLOR_TONES, peer } from './game.ts'
import { gridHouseCells, type PlayGrid } from './grid.ts'
import type { SizedRuleGame } from './sized-rule-game.ts'
import type { VariantPuzzle } from './engine.ts'

export type AlmostLockedSet = {
  cells: readonly number[]
  digitMask: number
}

const countBits = (mask: number) => {
  let count = 0
  for (; mask; mask &= mask - 1) count++
  return count
}

function distinctHouses(grid: PlayGrid, puzzle?: VariantPuzzle, sizedRules?: SizedRuleGame['rules']) {
  const size = grid.size
  const rows = Array.from({ length: size }, (_, row) => gridHouseCells({ row }, grid))
  const columns = Array.from({ length: size }, (_, column) => gridHouseCells({ column }, grid))
  const customRegions = puzzle?.regions && puzzle.regions.type !== 'boxes' ? puzzle.regions.regions : undefined
  const regions = customRegions
    ? [...customRegions]
    : 'noRegions' in grid ? [] : Array.from({ length: size }, (_, box) => gridHouseCells({ box }, grid))
  const variantHouses = (puzzle?.rules ?? []).flatMap((rule) => {
    if (rule.type === 'diagonal') return [rule.diagonal === 'main'
      ? Array.from({ length: size }, (_, index) => index * size + index)
      : Array.from({ length: size }, (_, index) => index * size + size - index - 1)]
    if (rule.type === 'extra-house' || rule.type === 'distinct-cells') return [[...rule.cells]]
    return []
  })
  const sizedHouses = sizedRules?.flatMap(rule => {
    if (rule.type === 'diagonal') return [rule.diagonal === 'main'
      ? Array.from({ length: size }, (_, index) => index * size + index)
      : Array.from({ length: size }, (_, index) => index * size + size - index - 1)]
    if (rule.type === 'extra-house') return [[...rule.cells]]
    return []
  }) ?? []

  const seen = new Set<string>()
  return [...rows, ...columns, ...regions, ...variantHouses, ...sizedHouses]
    .map(house => [...new Set(house)].filter(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2))
    .filter(house => house.length > 1 && (() => {
      const key = [...house].sort((a, b) => a - b).join(',')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })())
}

function enumerateAlmostLockedSets(masks: readonly number[], digitMask: number, selectedCount: number,
  houses: readonly (readonly number[])[]): AlmostLockedSet[] {
  const sets = new Map<string, AlmostLockedSet>()
  for (const house of houses) {
    const available = house.filter(cell => masks[cell] !== 0 && !(masks[cell] & ~digitMask))
    const maxCells = Math.min(available.length, selectedCount - 1)
    for (let targetSize = 1; targetSize <= maxCells; targetSize++) {
      const subset: number[] = []
      const visit = (start: number, union: number) => {
        if (subset.length === targetSize) {
          if (countBits(union) !== targetSize + 1) return
          const cells = [...subset].sort((a, b) => a - b)
          const key = `${union}:${cells.join(',')}`
          if (!sets.has(key)) sets.set(key, { cells, digitMask: union })
          return
        }
        const remaining = targetSize - subset.length
        for (let index = start; index <= available.length - remaining; index++) {
          const cell = available[index]
          const next = union | masks[cell]
          if (next & ~digitMask) continue
          subset.push(cell)
          visit(index + 1, next)
          subset.pop()
        }
      }
      visit(0, 0)
    }
  }
  return [...sets.values()]
}

function seesThroughRestrictedCandidate(first: AlmostLockedSet, second: AlmostLockedSet,
  masks: readonly number[], sees: readonly Uint8Array[], gridSize: number) {
  const sharedDigits = first.digitMask & second.digitMask
  for (let digit = 0; digit < gridSize; digit++) {
    const bit = 1 << digit
    if (!(sharedDigits & bit)) continue
    const firstOccurrences = first.cells.filter(cell => masks[cell] & bit)
    const secondOccurrences = second.cells.filter(cell => masks[cell] & bit)
    if (firstOccurrences.length && secondOccurrences.length &&
      firstOccurrences.every(aCell => secondOccurrences.every(bCell => aCell !== bCell && sees[aCell][bCell] === 1))) return true
  }
  return false
}

function interactingSetIndices(sets: readonly AlmostLockedSet[], masks: readonly number[],
  sees: readonly Uint8Array[], gridSize: number) {
  const interacting = new Set<number>()
  const setsByDigit = Array.from({ length: gridSize }, (_, digit) => sets.flatMap((set, index) =>
    set.digitMask & (1 << digit) ? [index] : []))
  for (const nodes of setsByDigit) {
    for (let first = 0; first < nodes.length; first++) {
      const firstIndex = nodes[first]
      const firstSet = sets[firstIndex]
      for (let second = first + 1; second < nodes.length; second++) {
        const secondIndex = nodes[second]
        if (interacting.has(firstIndex) && interacting.has(secondIndex)) continue
        if (!seesThroughRestrictedCandidate(firstSet, sets[secondIndex], masks, sees, gridSize)) continue
        interacting.add(firstIndex)
        interacting.add(secondIndex)
      }
    }
  }
  return interacting
}

/** Find ALS pairs that see one another through a restricted common candidate. */
export function findInteractingAlmostLockedSets({
  values, candidates, selectedDigits, grid, puzzle, sizedRules,
}: {
  values: string
  candidates: readonly number[]
  selectedDigits: number
  grid: PlayGrid
  puzzle?: VariantPuzzle
  sizedRules?: SizedRuleGame['rules']
}): AlmostLockedSet[] {
  const size = grid.size
  const digitMask = selectedDigits & ((1 << size) - 1)
  const selectedCount = countBits(digitMask)
  if (selectedCount < 2 || values.length !== size ** 2 || candidates.length !== values.length) return []

  const masks = candidates.map((mask, cell) => values[cell] === '0' ? mask & ((1 << size) - 1) : 0)
  const houses = distinctHouses(grid, puzzle, sizedRules)
  const sets = enumerateAlmostLockedSets(masks, digitMask, selectedCount, houses)
  const sees = Array.from({ length: values.length }, (_, cell) => {
    const peers = new Uint8Array(values.length)
    for (let other = 0; other < values.length; other++) {
      if (peer(cell, other, puzzle, grid, sizedRules)) peers[other] = 1
    }
    return peers
  })
  return [...interactingSetIndices(sets, masks, sees, size)].sort((a, b) => a - b).map(index => sets[index])
}

/** Reuse the color palette, extending it with distinct hues when many sets overlap. */
export function almostLockedSetColor(index: number): string {
  if (index < COLOR_TONES.length) return COLOR_TONES[index]
  const hue = ((index - COLOR_TONES.length) * 137.508 + 24) % 360
  const lightness = index % 2 ? '68%' : '78%'
  return `hsl(${hue} 62% ${lightness})`
}

export function almostLockedSetAnnotations(sets: readonly AlmostLockedSet[]) {
  const cells = new Map<number, { setMarkers: readonly { color: string }[] }>()
  sets.forEach((set, index) => {
    const color = almostLockedSetColor(index)
    for (const cell of set.cells) {
      const setMarkers = cells.get(cell)?.setMarkers ?? []
      cells.set(cell, { setMarkers: [...setMarkers, { color }] })
    }
  })
  return cells.size ? { cells } : undefined
}

