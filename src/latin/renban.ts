import { candidateCount, cellLabel, type LatinRule } from './engine.ts'

export const renbanTechnique = 'Renban'
export const renbanRuleNote = 'A Renban line contains a set of consecutive digits in any order. Each digit appears once on the line.'

export function renbanRule(size: number, cells: readonly number[]): LatinRule {
  const length = cells.length
  const location = cellLabel(cells[0], size)
  return {
    kind: 'renban', cells,
    label: `The Renban line through ${location} needs ${length} different consecutive digits.`,
    support(domains) {
      if (length > size) return null
      const full = (1 << length) - 1
      const supported = Array<number>(length).fill(0)
      const allowed = Array<number>(length).fill(0)
      const canFinish = new Uint8Array(full + 1)
      const reachable = new Uint8Array(full + 1)
      canFinish[full] = 1
      for (let start = 0; start <= size - length; start++) {
        for (let index = 0; index < length; index++) allowed[index] = (domains[cells[index]] >> start) & full
        if (allowed.some(mask => !mask)) continue
        if (allowed.every(mask => mask === full)) {
          for (let index = 0; index < length; index++) supported[index] |= full << start
          continue
        }

        // Each digit used in the interval fills one earlier cell.
        for (let used = full - 1; used >= 0; used--) {
          canFinish[used] = 0
          for (let digits = allowed[candidateCount(used)] & ~used; digits; digits &= digits - 1) {
            if (canFinish[used | (digits & -digits)]) {
              canFinish[used] = 1
              break
            }
          }
        }
        if (!canFinish[0]) continue

        reachable.fill(0)
        reachable[0] = 1
        for (let used = 0; used < full; used++) {
          if (!reachable[used]) continue
          const index = candidateCount(used)
          for (let digits = allowed[index] & ~used; digits; digits &= digits - 1) {
            const digit = digits & -digits
            const next = used | digit
            if (!canFinish[next]) continue
            reachable[next] = 1
            supported[index] |= digit << start
          }
        }
      }
      return supported[0] ? supported : null
    },
  }
}
