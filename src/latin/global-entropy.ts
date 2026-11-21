import { ENTROPY_AREAS } from '../sudoku/global-entropy.ts'
import { cellLabel, type LatinRule } from './engine.ts'
import { availableBands, digitsInBands } from './entropy-groups.ts'

export const globalEntropyTechnique = 'Global Entropy'
export const globalEntropyNote = 'Every 2 × 2 area contains a low digit (1–3), a medium digit (4–6), and a high digit (7–9).'

// Same four-cell support table as the Sudoku engine. Store three band bits per cell.
function buildSupportTable() {
  const patterns = 1 << 12
  const table = new Uint16Array(patterns)
  const choices = [1, 2, 4]
  for (const a of choices) for (const b of choices) for (const c of choices) for (const d of choices) {
    if ((a | b | c | d) !== 7) continue
    const assigned = a | (b << 3) | (c << 6) | (d << 9)
    const free = (patterns - 1) ^ assigned
    // Each superset of the assignment also supports these bands.
    for (let extra = free; ; extra = (extra - 1) & free) {
      table[assigned | extra] |= assigned
      if (!extra) break
    }
  }
  return table
}

let globalEntropyRules: readonly LatinRule[] | undefined

export function latinGlobalEntropyRules(size: number, enabled?: true): readonly LatinRule[] {
  if (!enabled) return []
  if (size !== 9) throw new Error('Global Entropy needs a 9 × 9 grid.')
  if (globalEntropyRules) return globalEntropyRules

  const table = buildSupportTable()
  globalEntropyRules = ENTROPY_AREAS.map(cells => {
    const [a, b, c, d] = cells
    return {
      kind: 'global-entropy',
      cells,
      label: `The 2 × 2 area from ${cellLabel(a, size)} to ${cellLabel(d, size)} needs a low, a medium, and a high digit.`,
      support(domains) {
        const pattern = availableBands[domains[a]] | (availableBands[domains[b]] << 3) |
          (availableBands[domains[c]] << 6) | (availableBands[domains[d]] << 9)
        const supported = table[pattern]
        if (!supported) return null
        return [
          domains[a] & digitsInBands[supported & 7],
          domains[b] & digitsInBands[(supported >> 3) & 7],
          domains[c] & digitsInBands[(supported >> 6) & 7],
          domains[d] & digitsInBands[supported >> 9],
        ]
      },
    }
  })
  return globalEntropyRules
}
