import type { SizedLinkedDoubleArrow, SizedSumEnd } from './engine.ts'

export const sizedXSumDirections = ['south', 'west', 'north', 'east'] as const
export type SizedXSumEnd = Exclude<SizedSumEnd, number>

export function sizedSumEndKey(end: SizedSumEnd) {
  return typeof end === 'number' ? String(end) : `${end.direction}:${end.index}`
}

export function sizedSumEndCells(end: SizedSumEnd, size: number) {
  if (typeof end === 'number') return [end]
  return Array.from({ length: size }, (_, offset) => end.direction === 'south' ? offset * size + end.index
    : end.direction === 'north' ? (size - 1 - offset) * size + end.index
      : end.direction === 'east' ? end.index * size + offset : end.index * size + size - 1 - offset)
}

export function linkedDoubleArrowCells(rule: SizedLinkedDoubleArrow, size: number) {
  return [...new Set([...rule.cells, ...rule.ends.flatMap(end => sizedSumEndCells(end, size))])]
}

export function sizedXSumSide(direction: SizedXSumEnd['direction']) {
  return direction === 'south' ? 'top' : direction === 'north' ? 'bottom' : direction === 'east' ? 'left' : 'right'
}

export function sizedSumEndLabel(end: SizedSumEnd, size: number) {
  if (typeof end === 'number') return `R${Math.floor(end / size) + 1}C${end % size + 1}`
  const side = sizedXSumSide(end.direction)
  return `X-Sum at the ${side} of ${side === 'top' || side === 'bottom' ? 'column' : 'row'} ${end.index + 1}`
}

export function isSizedSumEnd(end: unknown, size: number): end is SizedSumEnd {
  if (typeof end === 'number') return Number.isInteger(end) && end >= 0 && end < size ** 2
  if (!end || typeof end !== 'object' || Array.isArray(end) || Object.keys(end).length !== 2) return false
  const { direction, index } = end as Partial<SizedXSumEnd>
  return direction !== undefined && sizedXSumDirections.includes(direction) &&
    typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < size
}

function bounds(cells: readonly number[], values: string, size: number) {
  let min = 0, max = 0
  for (const cell of cells) {
    const digit = Number(values[cell])
    min += digit || 1
    max += digit || size
  }
  return [min, max] as const
}

function endBounds(end: SizedSumEnd, values: string, size: number) {
  const ray = sizedSumEndCells(end, size)
  if (typeof end === 'number') return bounds(ray, values, size)
  const first = Number(values[ray[0]])
  return first ? bounds(ray.slice(0, first), values, size) : [1, size * (size + 1) / 2] as const
}

export function linkedDoubleArrowConflicts(rule: SizedLinkedDoubleArrow, values: string, size: number) {
  const [a, b] = rule.ends.map(end => endBounds(end, values, size))
  const [low, high] = bounds(rule.cells, values, size)
  return a[0] + b[0] > high || a[1] + b[1] < low
}
