import type { CustomRule } from './custom-modes.ts'
import { difficultyIndex } from './difficulty.ts'
import type { Difficulty } from './engine.ts'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const reversal = digits.map(d => 10 - d)
const simpleMaps = [reversal, ...digits.flatMap(a => digits.filter(b => b > a)
  .map(b => digits.map(d => d === a ? b : d === b ? a : d)))]

// A digit relabelling must preserve each selected relation, including its
// complement when a missing dot or letter is a clue.
const relations = {
  consecutive: (a: number, b: number) => Math.abs(a - b) === 1,
  double: (a: number, b: number) => a === 2 * b || b === 2 * a,
  v: (a: number, b: number) => a + b === 5,
  x: (a: number, b: number) => a + b === 10,
  german: (a: number, b: number) => Math.abs(a - b) >= 5,
  dutch: (a: number, b: number) => Math.abs(a - b) >= 4,
  modulo: (a: number, b: number) => a % 3 === b % 3,
  entropy: (a: number, b: number) => Math.floor((a - 1) / 3) === Math.floor((b - 1) / 3),
}
type Relation = keyof typeof relations | 'parity' | 'sandwich'

function digitRelations(rule: CustomRule): Relation[] | undefined {
  switch (rule) {
    case 'jigsaw': case 'diagonal': case 'diagonal-main': case 'diagonal-anti': case 'windoku':
    case 'anti-knight': case 'anti-king': case 'palindrome': case 'clone': return []
    // The order of the digit interval can be kept or reversed for either line.
    case 'between': case 'renban': case 'kropki-white': case 'non-consecutive': return ['consecutive']
    case 'kropki-black': return ['double']
    case 'kropki': return ['consecutive', 'double']
    case 'xv-five': return ['v']
    case 'xv-ten': return ['x']
    case 'xv': return ['v', 'x']
    case 'whispers': return ['german']
    case 'dutch-whispers': return ['dutch']
    case 'parity': return ['parity']
    case 'modular': return ['modulo']
    case 'global-entropy': case 'entropic': return ['entropy']
    case 'sandwich': return ['sandwich']
    // Numeric totals, printed digits and directed clues can distinguish labels.
    default: return
  }
}

function findSymmetry(selected: ReadonlySet<Relation>) {
  const pairs = (Object.keys(relations) as (keyof typeof relations)[]).filter(r => selected.has(r))
  // Give digits and digit pairs colors. A valid assignment must preserve them.
  const color = (d: number) => (selected.has('sandwich') && d !== 1 && d !== 9 ? d : 0) * 2
    + (selected.has('parity') ? d % 2 : 0)
  const edges = digits.map(a => digits.map(b => pairs.reduce((mask, r, i) =>
    relations[r](a, b) ? mask | (1 << i) : mask, 0)))
  const fits = (prefix: readonly number[], target: number, index: number) =>
    color(index + 1) === color(target) && edges[index][index] === edges[target - 1][target - 1] &&
    prefix.slice(0, index).every((mapped, j) => edges[index][j] === edges[target - 1][mapped - 1])
  // Prefer an understandable witness, then try all remaining bijections.
  const simple = simpleMaps.find(map => map.every((target, index) => fits(map, target, index)))
  if (simple) return simple
  const prefix: number[] = []
  function extend(): number[] | undefined {
    if (prefix.length === 9) return prefix.some((d, i) => d !== i + 1) ? [...prefix] : undefined
    for (const target of digits) {
      if (prefix.includes(target) || !fits(prefix, target, prefix.length)) continue
      prefix.push(target)
      const result = extend()
      if (result) return result
      prefix.pop()
    }
  }
  return extend()
}

const reasons = new Map<string, string | undefined>()

export function miracleSymmetry(rules: readonly CustomRule[]): string | undefined {
  if (!rules.length) return
  const selected = new Set<Relation>()
  for (const rule of rules) {
    const required = digitRelations(rule)
    if (!required) return
    for (const relation of required) selected.add(relation)
  }
  const key = [...selected].sort().join(',')
  if (!reasons.has(key)) {
    const map = findSymmetry(selected)
    let reason: string | undefined
    if (map) {
      const changed = digits.filter(d => d !== map[d - 1])
      const operation = map === reversal ? 'Reversing digits 1–9'
        : changed.length === 2 ? `Swapping ${changed[0]} and ${changed[1]}`
          : `Relabeling ${changed.map(d => d + '→' + map[d - 1]).join(', ')}`
      reason = operation + ' gives a second solution with these rules.'
    }
    reasons.set(key, reason)
  }
  return reasons.get(key)
}

export function offersMiracle(difficulty: Difficulty, rules: readonly CustomRule[]) {
  return rules.length > 0 && difficultyIndex(difficulty) >= difficultyIndex('hard')
}
