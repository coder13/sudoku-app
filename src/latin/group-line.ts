import { lineGroups, type GroupLineKind } from '../sudoku/line-groups.ts'
import { latinDigitGroups } from './digit-group-tables.ts'
import { cellLabel, type LatinRule } from './engine.ts'

export const groupLineNames = { entropic: 'Entropic Line', modular: 'Modular Line' } as const

function digitGroupsText(kind: GroupLineKind, size: number) {
  const alphabet = Array.from({ length: size }, (_, index) => index + 1)
  return lineGroups[kind].masks
    .map(mask => alphabet.filter(digit => mask & (1 << (digit - 1))))
    .filter(group => group.length > 0)
    .map(group => `{${group.join(', ')}}`).join(', ')
}

export function groupLineNote(kind: GroupLineKind, size: number) {
  const name = groupLineNames[kind]
  return `On a ${name}, digits up to two positions apart belong to different groups. The groups are ${digitGroupsText(kind, size)}.`
}

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

export function groupLineRule(kind: GroupLineKind, size: number, path: readonly number[]): LatinRule {
  const { available: availableGroups, digits: digitsInGroups } = latinDigitGroups[kind]
  const name = groupLineNames[kind]
  const groups = digitGroupsText(kind, size)
  const requirement = kind === 'entropic' && size < 7 ? 'three different digit groups' : 'one digit from each group'
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
    kind, cells,
    label: path.length === 2
      ? `The ${name} puts ${endpoints} in different digit groups (${groups}).`
      : `The ${name} between ${endpoints} needs ${requirement} (${groups}) in every three successive positions.`,
    support(domains) {
      if (incompatible) return null
      // A two-cell line leaves the third position free to use the remaining group.
      let available = 0b111_111_111
      for (let index = 0; index < cells.length; index++) {
        const shift = shifts[index]
        available &= ~(7 << shift) | (availableGroups[domains[cells[index]]] << shift)
      }
      const supported = groupSupport[available]
      return supported ? cells.map((cell, index) => domains[cell] & digitsInGroups[(supported >> shifts[index]) & 7]) : null
    },
  }
}
