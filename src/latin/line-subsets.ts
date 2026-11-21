import { bit, candidateCount, cellLabel, latinLineRules, type LatinHint, type LatinRule } from './engine.ts'

const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })
const subsetsBySize: (readonly LatinRule[])[] = []
const subsetNames = { 'naked-pair': 'Naked pair', 'naked-triple': 'Naked triple' } as const

export const subsetTechniques = Object.values(subsetNames)

export function subsetTechnique(hint: LatinHint) {
  if (hint.rules.some(rule => rule.kind === 'naked-triple')) return subsetNames['naked-triple']
  if (hint.rules.some(rule => rule.kind === 'naked-pair')) return subsetNames['naked-pair']
}

export function lineSubsetRules(size: number): readonly LatinRule[] {
  return subsetsBySize[size] ??= buildSubsets(size)
}

function buildSubsets(size: number): LatinRule[] {
  const lines = latinLineRules(size)
  const digits = Array.from({ length: size }, (_, i) => i + 1)
  // With one cell outside the subset, the basic line rule already spots the only place for its digit.
  const counts = [2, 3].filter(count => count < size - 1)
  return counts.flatMap(count => lines.map((line): LatinRule => ({
    kind: count === 2 ? 'naked-pair' : 'naked-triple',
    label: line.label,
    cells: line.cells,
    afterBasic: true,
    support(domains, explain) {
      const eligible: number[] = []
      const supported = line.cells.map((cell, offset) => {
        const mask = domains[cell]
        const options = candidateCount(mask)
        if (options >= 2 && options <= count) eligible.push(offset)
        return mask
      })
      if (eligible.length < count) return supported
      const subset: number[] = []

      function find(start: number, candidates: number): number {
        if (subset.length === count) {
          if (candidateCount(candidates) !== count) return 0
          const canRemove = supported.some((mask, offset) => !subset.includes(offset) && (mask & candidates) !== 0)
          return canRemove ? candidates : 0
        }
        for (let i = start; i <= eligible.length - (count - subset.length); i++) {
          const offset = eligible[i]
          const combined = candidates | supported[offset]
          if (candidateCount(combined) > count) continue
          subset.push(offset)
          const match = find(i + 1, combined)
          if (match) return match
          subset.pop()
        }
        return 0
      }

      const candidates = find(0, 0)
      if (!candidates) return supported
      for (let offset = 0; offset < supported.length; offset++) {
        if (subset.includes(offset)) continue
        supported[offset] &= ~candidates
        if (!supported[offset]) return null
      }
      if (explain) {
        const cells = subset.map(offset => line.cells[offset])
        const digitNames = list.format(digits.filter(digit => candidates & bit(digit)).map(String))
        const cellNames = list.format(cells.map(cell => cellLabel(cell, size)))
        explain({
          cells,
          label: `Only ${digitNames} can go in ${cellNames}. Those digits cannot go elsewhere in ${line.label.toLowerCase()}.`,
        })
      }
      return supported
    },
  })))
}
