import type { SizedConstraintRule } from './engine.ts'

function positionDigit(value: string) {
  return Number.parseInt(value, 36) || 0
}

export type FractionalRegionsRule = Extract<SizedConstraintRule, { type: 'fractional-regions' }>

export const FRACTIONAL_REGIONS_DESCRIPTION =
  'All pieces have the same total. A cell contributes the fraction of its digit covered by each piece.'

export function fractionalRegionTarget(size: number, valueOffset: number, pieces: number) {
  return 2 * size ** 2 * (size + 1 - 2 * valueOffset) / pieces
}

export function validFractionalRegions(pieces: unknown, size: number, valueOffset: number): pieces is FractionalRegionsRule['pieces'] {
  const width = 2 * size
  const count = width ** 2
  if (!Array.isArray(pieces) || pieces.length < 2 || pieces.length > count ||
      !Number.isInteger(fractionalRegionTarget(size, valueOffset, pieces.length))) return false
  const occupied = new Set<number>()
  for (const piece of pieces) {
    if (!piece || typeof piece !== 'object' || Object.keys(piece).length !== 2 ||
        typeof piece.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(piece.color) ||
        !Array.isArray(piece.quarters) || !piece.quarters.length || piece.quarters.length > count) return false
    const quarters = new Set<number>()
    for (const quarter of piece.quarters) {
      if (!Number.isInteger(quarter) || quarter < 0 || quarter >= count || occupied.has(quarter)) return false
      occupied.add(quarter)
      quarters.add(quarter)
    }
    const connected = new Set<number>([piece.quarters[0]])
    for (const quarter of connected) {
      const x = quarter % width
      for (const next of [quarter - width, quarter + width, x > 0 ? quarter - 1 : -1, x < width - 1 ? quarter + 1 : -1]) {
        if (quarters.has(next)) connected.add(next)
      }
    }
    if (connected.size !== quarters.size) return false
  }
  return occupied.size === count
}

export function fractionalRegionWeights(quarters: readonly number[], size: number) {
  const weights = new Map<number, number>()
  const width = 2 * size
  for (const quarter of quarters) {
    const cell = Math.floor(quarter / width / 2) * size + Math.floor(quarter % width / 2)
    weights.set(cell, (weights.get(cell) ?? 0) + 1)
  }
  return weights
}

export function fractionalRegionEdges(pieces: FractionalRegionsRule['pieces'], size: number) {
  const width = 2 * size
  const owner = Array<number>(width ** 2)
  pieces.forEach(({ quarters }, piece) => quarters.forEach(quarter => { owner[quarter] = piece }))
  const edges: [x: number, y: number, endX: number, endY: number][] = []
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const quarter = y * width + x
    if (x && owner[quarter] !== owner[quarter - 1]) edges.push([x, y, x, y + 1])
    if (y && owner[quarter] !== owner[quarter - width]) edges.push([x, y, x + 1, y])
  }
  return edges
}

export function fractionalRegionConflicts(rule: FractionalRegionsRule, values: string, size: number, valueOffset: number) {
  const target = fractionalRegionTarget(size, valueOffset, rule.pieces.length)
  const conflicts = new Set<number>()
  for (const { quarters } of rule.pieces) {
    let minimum = 0
    let maximum = 0
    const placed: number[] = []
    for (const [cell, weight] of fractionalRegionWeights(quarters, size)) {
      const digit = positionDigit(values[cell])
      if (digit) placed.push(cell)
      minimum += weight * ((digit || 1) - valueOffset)
      maximum += weight * ((digit || size) - valueOffset)
    }
    if (minimum > target || maximum < target) for (const cell of placed) conflicts.add(cell)
  }
  return conflicts
}
