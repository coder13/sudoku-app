import type { VariantRule } from './engine.ts'

/** Mark a connection that passes over cells absent from the logical path. */
export function lineSkipsCells(cells: readonly number[], size = 9) {
  return cells.some((cell, i) => i > 0 && Math.max(
    Math.abs(cell % size - cells[i - 1] % size),
    Math.abs(Math.floor(cell / size) - Math.floor(cells[i - 1] / size)),
  ) > 1)
}

function paths(rule: VariantRule): readonly (readonly number[])[] {
  switch (rule.type) {
    case 'palindrome': case 'renban': case 'region-sum': return rule.segments ?? [rule.cells]
    case 'thermometer': case 'between': case 'whispers': case 'entropic': case 'modular': return [rule.cells]
    case 'arrow': return [[rule.circle, ...rule.cells]]
    default: return []
  }
}

/** Split straight paths at every grid center so long and short overlaps agree. */
function* edges(lines: readonly (readonly number[])[], size = 9) {
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const from = line[i - 1], to = line[i]
    const dx = to % size - from % size, dy = Math.floor(to / size) - Math.floor(from / size)
    let a = Math.abs(dx), b = Math.abs(dy)
    while (b) [a, b] = [b, a % b]
    if (!a) continue
    const delta = (dy * size + dx) / a
    for (let step = 0; step < a; step++) {
      const left = from + step * delta, right = left + delta
      yield Math.min(left, right) * size ** 2 + Math.max(left, right)
    }
  }
}

/** Separate line clues that share a visible line segment. */
export function coloredLineOverlapLanes(rules: readonly VariantRule[], size = 9) {
  const cellCount = size ** 2
  const owners = new Map<number, number[]>()
  rules.forEach((rule, index) => {
    if (rule.type !== 'renban' && rule.type !== 'entropic' && rule.type !== 'modular' && rule.type !== 'between' && rule.type !== 'region-sum') return
    for (const edge of new Set(edges(paths(rule), size))) {
      const list = owners.get(edge) ?? []
      list.push(index); owners.set(edge, list)
    }
  })
  const result = new Map<number, { cells: readonly [number, number]; lane: number; count: number }[]>()
  for (const [edge, indices] of owners) {
    if (indices.length < 2) continue
    indices.forEach((index, lane) => {
      const lines = result.get(index) ?? []
      lines.push({ cells: [Math.floor(edge / cellCount), edge % cellCount], lane, count: indices.length })
      result.set(index, lines)
    })
  }
  return result
}

/** A narrow dashed overlay keeps equality visible above another line's color. */
export function sharedPalindromeEdges(rules: readonly VariantRule[]) {
  const result = new Map<number, readonly (readonly [number, number])[]>()
  if (!rules.some(rule => rule.type === 'palindrome')) return result
  const other = new Set(rules.flatMap(rule => rule.type === 'palindrome' ? [] : [...edges(paths(rule))]))
  rules.forEach((rule, index) => {
    if (rule.type !== 'palindrome') return
    const shared = [...new Set(edges(paths(rule)))].filter(edge => other.has(edge))
    if (shared.length) result.set(index, shared.map(edge => [Math.floor(edge / 81), edge % 81]))
  })
  return result
}
