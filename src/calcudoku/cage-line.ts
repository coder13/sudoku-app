import { candidateCount, latinLineRules, type LatinRule } from '../latin/engine.ts'
import { tuplePrefixSkips } from '../latin/tuple-support.ts'

const list = new Intl.ListFormat('en')

/** Find digits that every valid cage assignment puts in the same line. */
export function cageLineRules(size: number, cage: LatinRule, tuples: Uint16Array): LatinRule[] {
  const length = cage.cells.length
  if (length < 2) return []
  const skips = tuplePrefixSkips(tuples, length)
  const positions = new Uint8Array(size * 2)
  for (let index = 0; index < length; index++) {
    const cell = cage.cells[index]
    positions[Math.floor(cell / size)] |= 1 << index
    positions[size + cell % size] |= 1 << index
  }
  const lines = latinLineRules(size)
  const rules: LatinRule[] = []
  for (let index = 0; index < positions.length; index++) {
    const count = candidateCount(positions[index])
    if (count < 2 || count === size) continue
    const line = lines[index]
    const inside: number[] = []
    for (let choices = positions[index]; choices; choices &= choices - 1) {
      inside.push(31 - Math.clz32(choices & -choices))
    }
    const outside = line.cells.filter(cell => !cage.cells.includes(cell))
    const cells = [...cage.cells, ...outside]
    rules.push({
      kind: 'cage-line',
      label: cage.label,
      cells,
      afterBasic: true,
      support(domains, explain) {
        const supported = cells.map(cell => domains[cell])
        let locked = 0
        for (let index = length; index < cells.length; index++) locked |= supported[index]
        let insideDigits = 0
        for (const index of inside) insideDigits |= supported[index]
        locked &= insideDigits
        if (!locked) return supported

        let found = false
        tuple: for (let offset = 0; offset < tuples.length;) {
          for (let index = 0; index < length; index++) {
            if (supported[index] & tuples[offset + index]) continue
            offset = skips ? skips[offset + index] : offset + length
            continue tuple
          }
          found = true
          let digits = 0
          for (const index of inside) digits |= tuples[offset + index]
          locked &= digits
          if (!locked) return supported
          offset += length
        }
        if (!found) return null
        for (let index = length; index < cells.length; index++) {
          supported[index] &= ~locked
          if (!supported[index]) return null
        }
        if (explain) {
          const digits: string[] = []
          for (let choices = locked; choices; choices &= choices - 1) {
            digits.push(String(32 - Math.clz32(choices & -choices)))
          }
          const digitNames = list.format(digits)
          const lineName = line.label.toLowerCase()
          explain({
            cells: cage.cells,
            label: `Every valid combination for the ${cage.label} places ${digitNames} in ${lineName}. Remove ${digitNames} from the rest of ${lineName}.`,
          })
        }
        return supported
      },
    })
  }
  return rules
}
