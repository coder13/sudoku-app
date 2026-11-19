import type { SizedVariantPosition } from './engine.ts'
import { MINI_GRID } from './grid.ts'

export type AlgebraicCage = SizedVariantPosition['rules'][number]

export function parseAlgebraicTotal(label: string): AlgebraicCage['total'] | undefined {
  if (/^[1-9][0-9]?$/.test(label) && Number(label) <= 10) return { type: 'fixed', value: Number(label) }
  const match = /^([A-Za-z][A-Za-z0-9_]{0,31})([+-][0-9]{1,10})?$/.exec(label)
  if (!match) return
  const offset = Number(match[2] ?? 0)
  if (offset >= -2147483648 && offset <= 2147483647) return { type: 'variable', name: match[1], offset }
}

export function algebraicLabel(total: AlgebraicCage['total']) {
  if (total.type === 'fixed') return String(total.value)
  const { name, offset } = total
  return name + (offset ? `${offset > 0 ? '+' : ''}${offset}` : '')
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isAlgebraicCageList(rules: unknown, { draft = false } = {}): rules is readonly AlgebraicCage[] {
  const occupied = new Set<number>()
  const { size } = MINI_GRID
  if (!Array.isArray(rules) || rules.length > size ** 2) return false
  let hasVariable = false
  for (const rule of rules) {
    if (!record(rule) || Object.keys(rule).length !== 4 || rule.type !== 'algebraic-cage' ||
      !Array.isArray(rule.cells) || !rule.cells.length || rule.cells.length > size || !record(rule.total) || typeof rule.label !== 'string') return false
    for (const cell of rule.cells) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= size ** 2 || occupied.has(cell)) return false
      occupied.add(cell)
    }
    const total = parseAlgebraicTotal(rule.label)
    const stored = rule.total
    if (!total || algebraicLabel(total) !== rule.label || Object.keys(stored).length !== Object.keys(total).length ||
      Object.entries(total).some(([key, value]) => stored[key] !== value)) return false
    if (total.type === 'variable') hasVariable = true
  }
  return draft || hasVariable
}

export function connectedCage(cells: readonly number[]) {
  if (!cells.length) return false
  const { size } = MINI_GRID
  const reached = new Set([cells[0]])
  for (const from of reached) {
    for (const to of cells) {
      const rowGap = Math.abs(Math.floor(from / size) - Math.floor(to / size))
      const columnGap = Math.abs(from % size - to % size)
      if (rowGap + columnGap === 1) reached.add(to)
    }
  }
  return cells.every(cell => reached.has(cell))
}
