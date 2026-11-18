import type { VariantRule } from './engine.ts'

function paths(rule: VariantRule): readonly (readonly number[])[] {
  switch (rule.type) {
    case 'palindrome': return rule.segments ?? [rule.cells]
    case 'thermometer': case 'whispers': return [rule.cells]
    case 'arrow': return [[rule.circle, ...rule.cells]]
    default: return []
  }
}

/** Split straight paths at every grid center so long and short overlaps agree. */
function* edges(lines: readonly (readonly number[])[]) {
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const from = line[i - 1], to = line[i]
    const dx = to % 9 - from % 9, dy = Math.floor(to / 9) - Math.floor(from / 9)
    let a = Math.abs(dx), b = Math.abs(dy)
    while (b) [a, b] = [b, a % b]
    if (!a) continue
    const delta = (dy * 9 + dx) / a
    for (let step = 0; step < a; step++) {
      const left = from + step * delta, right = left + delta
      yield Math.min(left, right) * 81 + Math.max(left, right)
    }
  }
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
