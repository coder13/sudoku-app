import type { SizedConstraintRule, VariantRule } from '../sudoku/engine'
import { disjointGroupRuleIndices, isQuadrupleRule } from '../sudoku/variants'
import { coloredLineOverlapLanes, lineSkipsCells, sharedPalindromeEdges, sharedRegionSumEnds } from '../sudoku/line-geometry'
import { cloneLayout } from '../sudoku/clone'

export type VariantClueOverlay = 'palindrome' | 'colored-line' | 'whispers-label' | 'endpoints'
export type VariantClueDrawingItem = {
  rule: VariantRule
  index: number
  overlay: VariantClueOverlay | undefined
  layer: number
}

export const pairKey = (a: number, b: number, size = 9) => Math.min(a, b) * size ** 2 + Math.max(a, b)

/** Merge every Kropki relation on an edge into a two-bit mask. */
export function kropkiDots(rules: readonly (VariantRule | SizedConstraintRule)[], size = 9) {
  const dots = new Map<number, number>()
  for (const rule of rules) {
    if (rule.type === 'labeled-dots') {
      const mask = rule.relation === 'ratio' ? 2 : 1
      for (const { cells: [a, b] } of rule.marks) {
        const key = pairKey(a, b, size)
        dots.set(key, (dots.get(key) ?? 0) | mask)
      }
    }
    if (rule.type !== 'kropki') continue
    for (const [kind, marks] of [rule.consecutive, rule.ratioTwo].entries()) {
      for (const [a, b] of marks?.pairs ?? []) {
        const key = pairKey(a, b, size)
        dots.set(key, (dots.get(key) ?? 0) | (1 << kind))
      }
    }
  }
  return dots
}

function drawingLayer(rule: VariantRule) {
  return rule.type === 'inside-grid' ? -4 : rule.type === 'clone' ? -3 :
    rule.type === 'parity' || rule.type === 'digit-restriction' || rule.type === 'distinct-cells' || rule.type === 'entropy-window-group' || rule.type === 'distant-neighbors' ? -2 :
      rule.type === 'aqre' ? -1.8 :
      rule.type === 'renban' ? -1.5 : rule.type === 'palindrome' ? -1 :
        rule.type === 'inequality' ? 2 : rule.type === 'xv' || rule.type === 'adjacent-total' ? 1.5 :
          isQuadrupleRule(rule) || rule.type === 'lettered-quadruples' || rule.type === 'kropki' || rule.type === 'labeled-dots' ? 1 :
            rule.type === 'between' || rule.type === 'lockout' ? .3 : rule.type === 'region-sum' ? .15 : 0
}

/** Resolve rule ordering and intersections separately from the SVG clue components. */
export function buildVariantClueModel(rules: readonly VariantRule[]) {
  const clones = cloneLayout(rules)
  const cloneIndices = new Map<number, number>()
  const renbanIndices = new Map<number, number>()
  const regionSumIndices = new Map<number, number>()
  rules.forEach((rule, index) => {
    if (rule.type === 'clone') cloneIndices.set(index, cloneIndices.size)
    if (rule.type === 'renban') renbanIndices.set(index, renbanIndices.size)
    if (rule.type === 'region-sum') regionSumIndices.set(index, regionSumIndices.size)
  })
  const disjoint = disjointGroupRuleIndices(rules)
  const shared = sharedPalindromeEdges(rules)
  const coloredLanes = coloredLineOverlapLanes(rules)
  const sumEnds = sharedRegionSumEnds(rules)
  const drawingOrder: VariantClueDrawingItem[] = rules.flatMap((rule, index) => [
    { rule, index, overlay: undefined, layer: drawingLayer(rule) },
    ...(shared.has(index) ? [{ rule, index, overlay: 'palindrome' as const, layer: .5 }] : []),
    ...(coloredLanes.has(index) ? [{ rule, index, overlay: 'colored-line' as const, layer: .4 }] : []),
    ...(rule.type === 'whispers' && rule.minDifference !== 5 ? [{ rule, index, overlay: 'whispers-label' as const, layer: .75 }] : []),
    ...(rule.type === 'between' || rule.type === 'lockout' ? [{ rule, index, overlay: 'endpoints' as const, layer: .65 }] : []),
  ]).sort((a, b) => a.layer - b.layer)
  const dots = kropkiDots(rules)
  const sums = new Map<number, Map<number, 'xv' | 'adjacent-total'>>()
  const addSum = (a: number, b: number, sum: number, kind: 'xv' | 'adjacent-total') => {
    const key = pairKey(a, b)
    const marks = sums.get(key) ?? new Map<number, 'xv' | 'adjacent-total'>()
    if (kind === 'xv' || !marks.has(sum)) marks.set(sum, kind)
    sums.set(key, marks)
  }
  for (const rule of rules) {
    if (rule.type === 'adjacent-total') addSum(rule.cells[0], rule.cells[1], rule.sum, 'adjacent-total')
    if (rule.type === 'xv') {
      for (const [kind, marks] of [rule.five, rule.ten].entries()) for (const [a, b] of marks?.pairs ?? []) {
        addSum(a, b, kind === 0 ? 5 : 10, 'xv')
      }
    }
  }
  const markedEdges = new Set([...dots.keys(), ...sums.keys()])
  for (const rule of rules) {
    if (rule.type === 'inequality') markedEdges.add(pairKey(rule.less, rule.greater))
    const circles = isQuadrupleRule(rule) ? [rule] : rule.type === 'lettered-quadruples' ? rule.clues : []
    for (const { topLeft } of circles) {
      markedEdges.add(pairKey(topLeft, topLeft + 10))
      markedEdges.add(pairKey(topLeft + 1, topLeft + 9))
    }
  }
  return { clones, cloneIndices, disjoint, shared, coloredLanes, sumEnds, renbanIndices, regionSumIndices, drawingOrder, dots, sums, markedEdges }
}
