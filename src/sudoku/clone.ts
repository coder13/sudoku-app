import type { VariantRule } from './engine.ts'

export type CloneSet = { readonly label: string; readonly cells: readonly number[] }
type CloneLayout = { readonly sets: readonly CloneSet[]; readonly at: readonly (CloneSet | undefined)[] }
const empty: CloneLayout = { sets: [], at: [] }
const layouts = new WeakMap<readonly VariantRule[], CloneLayout>()

function letter(index: number): string {
  return (index >= 26 ? letter(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + index % 26)
}

/** Compile immutable Clone clues into transitive equality sets in first-visit order. */
export function cloneLayout(rules?: readonly VariantRule[]): CloneLayout {
  if (!rules) return empty
  const cached = layouts.get(rules)
  if (cached) return cached
  const links = new Map<number, Set<number>>()
  for (const rule of rules) if (rule.type === 'clone') for (const cells of rule.groups) {
    const first = links.get(cells[0]) ?? new Set<number>()
    links.set(cells[0], first)
    for (const cell of cells) {
      const neighbors = links.get(cell) ?? new Set<number>()
      neighbors.add(cells[0])
      first.add(cell)
      links.set(cell, neighbors)
    }
  }
  const sets: CloneSet[] = [], at: (CloneSet | undefined)[] = []
  for (const cell of links.keys()) {
    if (at[cell]) continue
    const connected = new Set([cell])
    for (const next of connected) for (const neighbor of links.get(next)!) connected.add(neighbor)
    const set = { label: letter(sets.length), cells: [...connected] }
    sets.push(set)
    for (const member of connected) at[member] = set
  }
  const result = { sets, at }
  layouts.set(rules, result)
  return result
}
