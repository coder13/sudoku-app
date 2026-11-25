import { cellLabel, distinctLatinRule, type LatinRule } from './engine.ts'

export type LatinExclusion = 'anti-knight' | 'anti-king' | 'nonconsecutive' | {
  type: 'nonconsecutive'
  except?: readonly (readonly [number, number])[]
}

export function validLatinExclusions(value: unknown, size = 9): value is readonly LatinExclusion[] {
  if (!Number.isInteger(size) || size < 3 || size > 9) return false
  return Array.isArray(value) && value.length <= 3 &&
    value.every((rule, index) => {
      if (rule === 'anti-knight' || rule === 'anti-king' || rule === 'nonconsecutive') return value.indexOf(rule) === index
      if (!rule || typeof rule !== 'object' || rule.type !== 'nonconsecutive' ||
        Object.keys(rule).some(key => key !== 'type' && key !== 'except') || value.some((other, i) => i !== index &&
          (other === 'nonconsecutive' || typeof other === 'object' && other?.type === 'nonconsecutive'))) return false
      return rule.except === undefined || Array.isArray(rule.except) && rule.except.length <= 144 &&
        rule.except.every((pair: readonly [number, number], pairIndex: number) => Array.isArray(pair) && pair.length === 2 &&
          pair.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2) && pair[0] < pair[1] &&
          Math.abs(Math.floor(pair[1] / size) - Math.floor(pair[0] / size)) + Math.abs(pair[1] % size - pair[0] % size) === 1 &&
          rule.except!.findIndex((other: readonly [number, number]) => other[0] === pair[0] && other[1] === pair[1]) === pairIndex)
    })
}

function nonconsecutiveRule(cells: readonly [number, number], size: number, label: string): LatinRule {
  return { kind: 'nonconsecutive', label, cells, support(domains) {
    const [a, b] = cells.map(cell => domains[cell])
    if (!a || !b) return null
    let supportedA = 0
    let supportedB = 0
    for (let digitA = 1; digitA <= size; digitA++) {
      const maskA = 1 << (digitA - 1)
      if (!(a & maskA)) continue
      for (let digitB = 1; digitB <= size; digitB++) {
        const maskB = 1 << (digitB - 1)
        if ((b & maskB) && Math.abs(digitA - digitB) !== 1) {
          supportedA |= maskA
          supportedB |= maskB
        }
      }
    }
    return supportedA && supportedB ? [supportedA, supportedB] : null
  } }
}

function distinctPeersRule(cells: readonly [number, number], size: number, label: string,
  kind: 'anti-knight' | 'anti-king'): LatinRule {
  return { kind, label, cells, support(domains) {
    const [a, b] = cells.map(cell => domains[cell])
    if (!a || !b) return null
    let supportedA = 0
    let supportedB = 0
    for (let digitA = 1; digitA <= size; digitA++) {
      const maskA = 1 << (digitA - 1)
      if (!(a & maskA)) continue
      for (let digitB = 1; digitB <= size; digitB++) {
        const maskB = 1 << (digitB - 1)
        if ((b & maskB) && digitA !== digitB) {
          supportedA |= maskA
          supportedB |= maskB
        }
      }
    }
    return supportedA && supportedB ? [supportedA, supportedB] : null
  } }
}

export function compileLatinExclusions(exclusions: readonly LatinExclusion[], size: number): LatinRule[] {
  if (!validLatinExclusions(exclusions, size)) throw new Error('This Latin puzzle has invalid anti-move rules.')
  const rules: LatinRule[] = []
  for (const declaration of exclusions) {
    const exclusion = typeof declaration === 'string' ? declaration : declaration.type
    const except = typeof declaration === 'string' ? new Set<string>() : new Set(declaration.except?.map(pair => pair.join(',')))
    const offsets = exclusion === 'anti-knight' ? [[1, -2], [1, 2], [2, -1], [2, 1]]
      : exclusion === 'anti-king' ? [[1, -1], [1, 1]] : [[0, 1], [1, 0]]
    for (let cell = 0; cell < size ** 2; cell++) {
      const row = Math.floor(cell / size)
      const column = cell % size
      for (const [rowOffset, columnOffset] of offsets) {
        const otherRow = row + rowOffset
        const otherColumn = column + columnOffset
        if (otherRow < size && otherColumn >= 0 && otherColumn < size) {
          const other = otherRow * size + otherColumn
          if (exclusion === 'nonconsecutive' && except.has(`${Math.min(cell, other)},${Math.max(cell, other)}`)) continue
          const name = exclusion === 'anti-knight' ? 'Anti-Knight' : exclusion === 'anti-king' ? 'Anti-King' : 'Non-Consecutive'
          const label = `${name}: ${cellLabel(cell, size)} and ${cellLabel(other, size)}`
          rules.push(exclusion === 'nonconsecutive' ? nonconsecutiveRule([cell, other], size, label)
            : distinctPeersRule([cell, other], size, label, exclusion))
        }
      }
    }
  }
  return rules
}
