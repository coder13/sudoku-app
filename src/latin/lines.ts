import { isHexColor } from '../sudoku/imported-colors.ts'
import { betweenSupport, lockoutSupport } from '../sudoku/between.ts'
import { arrowSupport } from '../sudoku/arrow.ts'
import type { SizedConstraintRule } from '../sudoku/engine.ts'
import { cellLabel, type LatinRule } from './engine.ts'

export type LatinLine = Extract<SizedConstraintRule, { type: 'thermometer' | 'renban' }>
  | { type: 'entropic'; cells: readonly number[]; groups: readonly (readonly number[])[] }
  | { type: 'modular'; cells: readonly number[] }
  | { type: 'between'; cells: readonly number[] }
  | { type: 'lockout'; cells: readonly number[]; minDifference: 4 }
  | { type: 'arrow'; circle: number; cells: readonly number[] }

export const latinLineRulesText = {
  thermometer: 'Digits increase from the bulb to the tip of each Thermometer.',
  renban: 'Each Renban line contains different consecutive digits in any order.',
  entropic: 'Every three consecutive cells on an Entropic line use digits from three different groups.',
  modular: 'Every three consecutive cells on a Modular line use digits from three different remainders after division by 3.',
  between: 'Each interior digit lies strictly between the two end digits of its Between line.',
  lockout: 'The Lockout line ends differ by at least four; each interior digit is lower than both ends or higher than both.',
  arrow: 'The digits along each Arrow sum to the digit in its bulb.',
}

export const latinLineTechnique = { thermometer: 'Thermometer', renban: 'Renban' }

function modularGroups(size: number) {
  return [0, 1, 2].map(remainder => Array.from({ length: size }, (_, index) => index + 1)
    .filter(digit => (digit - 1) % 3 === remainder))
}

function validGroups(groups: unknown, size: number): groups is readonly (readonly number[])[] {
  if (!Array.isArray(groups) || !groups.length || groups.length > 3 ||
    groups.some(group => !Array.isArray(group) || !group.length || group.some(digit =>
      !Number.isInteger(digit) || digit < 1 || digit > size))) return false
  const flattened = groups.flat()
  return flattened.length === size && new Set(flattened).size === size
}

function validGroupedCells(cells: readonly number[]) {
  const phaseByCell = new Map<number, number>()
  for (const [index, cell] of cells.entries()) {
    const phase = index % 3
    if (phaseByCell.has(cell) && phaseByCell.get(cell) !== phase) return false
    phaseByCell.set(cell, phase)
  }
  return true
}

export function validLatinLines(value: unknown, size: number): value is readonly LatinLine[] {
  const inGrid = (cell: unknown) => typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < size ** 2
  if (!Array.isArray(value) || value.length > 128) return false
  return value.every(line => {
    if (!line || typeof line !== 'object' || !Array.isArray(line.cells) ||
      !line.cells.length || line.cells.length > 128 || !line.cells.every(inGrid)) return false
    if (line.type === 'entropic') return Object.keys(line).every(key => ['type', 'cells', 'groups'].includes(key)) &&
      validGroups(line.groups, size) && validGroupedCells(line.cells)
    if (line.type === 'modular') return Object.keys(line).every(key => key === 'type' || key === 'cells') &&
      validGroupedCells(line.cells)
    if (line.type === 'between') return line.cells.length >= 3 && new Set(line.cells).size === line.cells.length &&
      Object.keys(line).every(key => key === 'type' || key === 'cells')
    if (line.type === 'lockout') return size >= 6 && line.cells.length >= 3 && new Set(line.cells).size === line.cells.length &&
      line.minDifference === 4 && Object.keys(line).every(key => ['type', 'cells', 'minDifference'].includes(key))
    if (line.type === 'arrow') return line.cells.length >= 1 && line.cells.length <= size && inGrid(line.circle) &&
      !line.cells.includes(line.circle) && new Set(line.cells).size === line.cells.length &&
      Object.keys(line).every(key => ['type', 'circle', 'cells'].includes(key))
    if (line.cells.length > size || new Set(line.cells).size !== line.cells.length) return false
    if (line.type === 'thermometer') return line.cells.length >= 2 &&
      Object.keys(line).every(key => ['type', 'cells', 'color'].includes(key)) &&
      (line.color === undefined || isHexColor(line.color))
    if (line.type !== 'renban' || Object.keys(line).some(key => !['type', 'cells', 'segments'].includes(key))) return false
    if (line.segments === undefined) return true
    const used = new Set<number>()
    return Array.isArray(line.segments) && line.segments.length >= 1 && line.segments.length <= 128 &&
      line.segments.every((segment: unknown) => Array.isArray(segment) && segment.length >= 1 && segment.length <= 128 &&
        segment.every(cell => {
          if (!line.cells.includes(cell)) return false
          used.add(cell)
          return true
        })) && used.size === line.cells.length
  })
}

function thermometerSupport(masks: number[]) {
  if (masks.includes(0)) return null
  for (let index = 1; index < masks.length; index++) {
    const smallestPrevious = masks[index - 1] & -masks[index - 1]
    masks[index] &= ~(2 * smallestPrevious - 1)
    if (!masks[index]) return null
  }
  for (let index = masks.length - 2; index >= 0; index--) {
    const largestNext = 1 << (31 - Math.clz32(masks[index + 1]))
    masks[index] &= largestNext - 1
    if (!masks[index]) return null
  }
  return masks
}

function renbanSupport(masks: readonly number[], size: number) {
  if (masks.includes(0)) return null
  const length = masks.length
  const all = (1 << length) - 1
  // Equal domains can accept every rank in each contained interval.
  if (masks.every(mask => mask === masks[0])) {
    let eligible = 0
    for (let start = 0; start + length <= size; start++) {
      const interval = all << start
      if ((masks[0] & interval) === interval) eligible |= interval
    }
    return eligible ? masks.map(() => eligible) : null
  }
  const support = masks.map(() => 0)
  for (let start = 0; start + length <= size; start++) {
    const candidates = masks.map(mask => (mask >> start) & all)
    if (candidates.includes(0) || candidates.reduce((union, mask) => union | mask, 0) !== all) continue
    const finish = new Uint8Array(1 << length)
    const visited = new Uint8Array(finish.length)

    // A matching state depends only on the used ranks. Its depth equals their count.
    function canFinish(index: number, used: number): boolean {
      if (index === length) return true
      if (finish[used]) return finish[used] === 2
      for (let remaining = candidates[index] & ~used; remaining; remaining &= remaining - 1) {
        if (canFinish(index + 1, used | (remaining & -remaining))) {
          finish[used] = 2
          return true
        }
      }
      finish[used] = 1
      return false
    }

    function collect(index: number, used: number) {
      if (index === length || visited[used]) return
      visited[used] = 1
      for (let remaining = candidates[index] & ~used; remaining; remaining &= remaining - 1) {
        const digit = remaining & -remaining
        if (!canFinish(index + 1, used | digit)) continue
        support[index] |= digit << start
        collect(index + 1, used | digit)
      }
    }

    if (canFinish(0, 0)) collect(0, 0)
    if (support.every((mask, index) => mask === masks[index])) break
  }
  return support[0] ? support : null
}

const groupOrders = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
]

function compileGroupedLine(line: Extract<LatinLine, { type: 'entropic' | 'modular' }>, size: number): LatinRule {
  const groups = line.type === 'entropic' ? line.groups : modularGroups(size)
  const groupMasks = groups.map(group => group.reduce((mask, digit) => mask | 1 << (digit - 1), 0))
  const phaseByCell = new Map<number, number>()
  line.cells.forEach((cell, index) => phaseByCell.set(cell, index % 3))
  const cells = [...phaseByCell.keys()]
  const phaseCount = Math.min(3, line.cells.length)
  const orders = groupOrders.filter(order => order.slice(0, phaseCount).every(group => group < groups.length))
  const name = line.type === 'entropic' ? 'Entropic' : 'Modular'

  return {
    kind: line.type,
    cells,
    label: `${name} line through ${line.cells.map(cell => cellLabel(cell, size)).join(', ')}`,
    support(domains) {
      const availableByPhase = [7, 7, 7]
      for (const cell of cells) {
        const domain = domains[cell]
        let available = 0
        for (let group = 0; group < groupMasks.length; group++) {
          if (domain & groupMasks[group]) available |= 1 << group
        }
        const phase = phaseByCell.get(cell)!
        availableByPhase[phase] &= available
        if (!availableByPhase[phase]) return null
      }
      const supportedGroups = [0, 0, 0]
      for (const order of orders) {
        if (!order.slice(0, phaseCount).every((group, phase) => availableByPhase[phase] & (1 << group))) continue
        for (let phase = 0; phase < phaseCount; phase++) supportedGroups[phase] |= 1 << order[phase]
      }
      if (!supportedGroups[0]) return null
      return cells.map(cell => {
        const allowed = groupMasks.reduce((mask, digits, group) =>
          supportedGroups[phaseByCell.get(cell)!] & (1 << group) ? mask | digits : mask, 0)
        return domains[cell] & allowed
      })
    },
  }
}

export function compileLatinLines(lines: readonly LatinLine[], size: number): LatinRule[] {
  if (!validLatinLines(lines, size)) throw new Error('This puzzle has an invalid Thermometer or Renban line.')
  return lines.map(line => {
    if (line.type === 'entropic' || line.type === 'modular') return compileGroupedLine(line, size)
    const { cells, type } = line
    if (type === 'arrow') {
      const path = [line.circle, ...cells]
      return {
        kind: type,
        cells: path,
        label: `Arrow from ${cellLabel(line.circle, size)} through ${cells.map(cell => cellLabel(cell, size)).join(', ')}`,
        support: domains => arrowSupport(path.map(cell => domains[cell]), size),
      }
    }
    if (type === 'between' || type === 'lockout') return {
      kind: type,
      cells,
      label: type === 'between'
        ? `Between line from ${cellLabel(cells[0], size)} to ${cellLabel(cells.at(-1)!, size)}`
        : `Lockout line from ${cellLabel(cells[0], size)} to ${cellLabel(cells.at(-1)!, size)}`,
      support: domains => type === 'between' ? betweenSupport(cells.map(cell => domains[cell]))
        : lockoutSupport(cells.map(cell => domains[cell]), size, line.minDifference),
    }
    return {
      kind: type,
      cells,
      label: type === 'thermometer'
        ? `Thermometer digits increase from ${cellLabel(cells[0], size)} to ${cellLabel(cells[cells.length - 1], size)}`
        : `The Renban line through ${cells.map(cell => cellLabel(cell, size)).join(', ')} uses different consecutive digits`,
      support(domains) {
        const masks = cells.map(cell => domains[cell])
        return type === 'thermometer' ? thermometerSupport(masks) : renbanSupport(masks, size)
      },
    }
  })
}


export function latinLineNames(lines: readonly LatinLine[] = []) {
  return [...new Set(lines.map(line => line.type))]
}

export function latinLineCellLabels(size: number, lines: readonly LatinLine[] = []) {
  const labels: string[][] = Array.from({ length: size ** 2 }, () => [])
  for (const line of lines) {
    if (line.type === 'arrow') {
      labels[line.circle].push(`Arrow bulb, total of the digits through ${line.cells.map(cell => cellLabel(cell, size)).join(', ')}`)
      for (const cell of line.cells) labels[cell].push(`Arrow shaft, contributes to the bulb at ${cellLabel(line.circle, size)}`)
      continue
    }
    if (line.type === 'between' || line.type === 'lockout') {
      for (const cell of line.cells) labels[cell].push(`${line.type === 'between' ? 'Between' : 'Lockout'} line from ${cellLabel(line.cells[0], size)} to ${cellLabel(line.cells.at(-1)!, size)}`)
      continue
    }
    if (line.type === 'entropic' || line.type === 'modular') {
      for (const cell of new Set(line.cells)) labels[cell].push(`${line.type === 'entropic' ? 'Entropic' : 'Modular'} line`)
      continue
    }
    if (line.type === 'renban') {
      for (const cell of line.cells) labels[cell].push(`Renban line, ${line.cells.length} consecutive digits in any order`)
      continue
    }
    const bulb = cellLabel(line.cells[0], size)
    const tip = cellLabel(line.cells[line.cells.length - 1], size)
    for (const [index, cell] of line.cells.entries()) {
      if (index === 0) labels[cell].push(`Thermometer bulb, starts the increase to ${tip}`)
      else if (index === line.cells.length - 1) labels[cell].push(`Thermometer tip, end of the increase from ${bulb}`)
      else labels[cell].push(`Thermometer, increasing from ${bulb} to ${tip}`)
    }
  }
  return labels
}
