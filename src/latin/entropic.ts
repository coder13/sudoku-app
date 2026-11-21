import { availableBands, digitsInBands } from './entropy-groups.ts'
import { cellLabel, type LatinRule } from './engine.ts'

export const entropicTechnique = 'Entropic Lines'
export const entropicRuleNote = 'Each group of three successive positions on an Entropic Line has one low (1–3), one medium (4–6), and one high digit (7–9). Two-cell lines use different groups. Each path has its own rule.'

// Pack the available groups for each of the three positions into three bits each.
const groupSupport = Uint16Array.from({ length: 512 }, (_, available) => {
  let supported = 0
  for (const first of [1, 2, 4]) {
    for (const second of [1, 2, 4]) {
      if (first === second) continue
      const third = 7 ^ first ^ second
      const assignment = first | (second << 3) | (third << 6)
      if ((available & assignment) === assignment) supported |= assignment
    }
  }
  return supported
})

export function entropicRule(size: number, path: readonly number[]): LatinRule {
  const positionByCell = new Map<number, number>()
  let incompatible = false
  // Consecutive triples overlap, so group membership repeats every three positions.
  for (const [index, cell] of path.entries()) {
    const shift = (index % 3) * 3
    const previous = positionByCell.get(cell)
    if (previous !== undefined && previous !== shift) incompatible = true
    positionByCell.set(cell, shift)
  }
  const cells = [...positionByCell.keys()]
  const shifts = [...positionByCell.values()]
  const endpoints = `${cellLabel(path[0], size)} and ${cellLabel(path.at(-1)!, size)}`
  return {
    kind: 'entropic', cells,
    label: path.length === 2
      ? `The Entropic Line puts ${endpoints} in different digit groups (1–3, 4–6, 7–9).`
      : `The Entropic Line between ${endpoints} needs one digit from each group (1–3, 4–6, 7–9) in every three successive positions.`,
    support(domains) {
      if (incompatible) return null
      // A two-cell line leaves the third position free to use the remaining group.
      let available = 0b111_111_111
      for (let index = 0; index < cells.length; index++) {
        const shift = shifts[index]
        available &= ~(7 << shift) | (availableBands[domains[cells[index]]] << shift)
      }
      const supported = groupSupport[available]
      return supported ? cells.map((cell, index) => domains[cell] & digitsInBands[(supported >> shifts[index]) & 7]) : null
    },
  }
}
