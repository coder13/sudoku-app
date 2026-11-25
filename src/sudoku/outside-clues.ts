import type { VariantRule } from './engine.ts'
import type { SizedConstraintRule } from './engine.ts'

type CrustOutsideClue = { type: 'crust-clue'; direction: Direction; cells: readonly number[]; sum: number; crossed?: number }
export type OutsideRule = Extract<VariantRule, { type: 'sandwich' | 'little-killer' | 'x-sum' | 'skyscrapers' }>
  | Extract<VariantRule, { type: 'digit-order' }>
  | Extract<SizedConstraintRule, { type: 'nonogram' }>
  | CrustOutsideClue
export type OutsideRuleSource = VariantRule | Extract<SizedConstraintRule, { type: 'sandwich' | 'nonogram' }> | CrustOutsideClue
const ORTHOGONAL_CLUES = {
  sandwich: { prefix: 'S', name: 'Sandwich' },
  'x-sum': { prefix: 'X', name: 'X-Sums' },
  skyscrapers: { prefix: 'Sk', name: 'Skyscrapers' },
  'crust-clue': { prefix: 'C', name: 'Crust' },
} as const
export type OutsideSide = 'top' | 'right' | 'bottom' | 'left'
type Direction = Extract<VariantRule, { direction: string }>['direction']
const DELTAS: Record<Direction, readonly [number, number]> = {
  north: [-1, 0],
  east: [0, 1],
  south: [1, 0],
  west: [0, -1],
  'north-east': [-1, 1],
  'south-east': [1, 1],
  'south-west': [1, -1],
  'north-west': [-1, -1],
}

export function clueDelta(direction: Direction) {
  return DELTAS[direction]
}

/** A complete ray from its first edge cell to the opposite edge, in clue order. */
export function validOutsideRay(cells: readonly number[], direction: string, diagonal = false, size = 9) {
  if (typeof direction !== 'string' || !Array.isArray(cells) || !cells.length || !Object.hasOwn(DELTAS, direction)) return false
  const [dr, dc] = DELTAS[direction as Direction]
  if (Boolean(dr && dc) !== diagonal) return false
  const first = cells[0]
  if (!Number.isInteger(first) || first < 0 || first >= size ** 2) return false
  let row = Math.floor(first / size),
    column = first % size
  const inside = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size
  if (inside(row - dr, column - dc)) return false
  for (const cell of cells) {
    if (!inside(row, column) || cell !== row * size + column) return false
    row += dr
    column += dc
  }
  return !inside(row, column)
}

const cellName = (cell: number, size: number) => `R${Math.floor(cell / size) + 1}C${(cell % size) + 1}`
export function outsideClueLabel(rule: OutsideRule, size = 9) {
  if (rule.type === 'digit-order') {
    const first = rule.cells[0], last = rule.cells.at(-1)!
    const step = rule.cells[1] - first
    const side = step === 9 ? 'top' : step === -9 ? 'bottom' : step === 1 ? 'left' : 'right'
    const house = first % size === last % size
      ? `column ${first % size + 1}` : `row ${Math.floor(first / size) + 1}`
    const group = rule.digits[0] <= 3 ? 'low' : rule.digits[0] <= 6 ? 'middle' : 'high'
    return `Entropic ${group} group clue outside ${house}: digits ${rule.digits.join(', ')} appear in ascending order from the ${side}.`
  }
  if (rule.type === 'nonogram') {
    const digitGroup = rule.digits.join(', ')
    const otherDigits = Array.from({ length: size }, (_, index) => index + 1).filter(digit => !rule.digits.includes(digit)).join(', ')
    return `Nonogram ${rule.axis} ${rule.index + 1}: selected digits ${digitGroup} form consecutive groups of lengths ${rule.runs.join(', ')}, separated by other digits ${otherDigits}.`
  }
  if (rule.type === 'crust-clue') {
    const side = rule.direction === 'south' ? 'top' : rule.direction === 'north' ? 'bottom'
      : rule.direction === 'east' ? 'left' : 'right'
    const location = `${side} of ${side === 'top' || side === 'bottom' ? 'column ' + ((rule.cells[0] % size) + 1) : 'row ' + (Math.floor(rule.cells[0] / size) + 1)}`
    const edgeCount = rule.crossed === undefined ? '' : ` The small clue counts ${rule.crossed} earlier region ${rule.crossed === 1 ? 'boundary' : 'boundaries'} crossed.`
    return `Crust total ${rule.sum}, ${location}: add digits from the grid edge until the first region boundary stops the line.${edgeCount}`
  }
  if (rule.type === 'little-killer')
    return `Little Killer ${rule.sum}, ${rule.direction.replace('-', ' ')} from ${cellName(rule.cells[0], size)} to ${cellName(rule.cells[rule.cells.length - 1], size)}: all indicated digits sum to ${rule.sum}. Digits may repeat if the other puzzle rules allow it.`
  const side =
    rule.direction === 'south'
      ? 'top'
      : rule.direction === 'north'
        ? 'bottom'
        : rule.direction === 'east'
          ? 'left'
          : 'right'
  const location = `${side} of ${side === 'top' || side === 'bottom' ? 'column ' + ((rule.cells[0] % size) + 1) : 'row ' + (Math.floor(rule.cells[0] / size) + 1)}`
  if (rule.type === 'skyscrapers')
    return `Skyscrapers ${rule.count}, ${location}: looking from ${cellName(rule.cells[0], size)}, count the first building and each new tallest building. Exactly ${rule.count} ${rule.count === 1 ? 'building is' : 'buildings are'} visible.`
  return rule.type === 'x-sum'
    ? `X-Sum ${rule.sum}, ${location}: the first digit counts how many cells to add, including itself, starting at ${cellName(rule.cells[0], size)}.`
    : `Sandwich ${rule.sum}, ${location}: digits strictly between 1 and ${size} sum to ${rule.sum}; 1 and ${size} are excluded.`
}

/** Prefix otherwise ambiguous outside numbers when orthogonal rule families are combined. */
export function outsideClueLegend(rules?: readonly OutsideRuleSource[]) {
  const active = (Object.keys(ORTHOGONAL_CLUES) as (keyof typeof ORTHOGONAL_CLUES)[])
    .filter(type => rules?.some(rule => rule.type === type))
  return active.length > 1 ? active.map(type => `${ORTHOGONAL_CLUES[type].prefix} = ${ORTHOGONAL_CLUES[type].name}`) : []
}

/** Lay out all edge and corner labels in cell coordinates. Repeated anchors move outward along their ray. */
export function outsideClueLayout(rules?: readonly OutsideRuleSource[], size = 9) {
  const clues: {
      rule: OutsideRule
    lane: number
    x: number
    y: number
    dr: number
    dc: number
    label: string
    secondaryLabel?: string
    arrow?: { x1: number; y1: number; x2: number; y2: number }
  }[] = []
  const depths = { top: 0, right: 0, bottom: 0, left: 0 }
  const legend = outsideClueLegend(rules)
  const anchors = new Map<string, { lane: number; extent: number }>()
  for (const rule of rules ?? []) {
    if (rule.type === 'digit-order') {
      const first = rule.cells[0]
      const step = rule.cells[1] - first
      const dr = step === 9 ? -1 : step === -9 ? 1 : 0
      const dc = step === 1 ? -1 : step === -1 ? 1 : 0
      const ox = first % size + 0.5 + dc * 0.85
      const oy = Math.floor(first / size) + 0.5 + dr * 0.85
      const key = `${ox},${oy}`
      const prior = anchors.get(key) ?? { lane: 0, extent: 0 }
      const x = first % size + 0.5 + dc * (0.85 + prior.extent)
      const y = Math.floor(first / size) + 0.5 + dr * (0.85 + prior.extent)
      const group = rule.digits[0] <= 3 ? 'L' : rule.digits[0] <= 6 ? 'M' : 'H'
      clues.push({ rule, lane: prior.lane, x, y, dr: -dr, dc: -dc, label: group })
      const extent = prior.extent + 0.7
      if (dr === -1) depths.top = Math.max(depths.top, extent)
      if (dr === 1) depths.bottom = Math.max(depths.bottom, extent)
      if (dc === -1) depths.left = Math.max(depths.left, extent)
      if (dc === 1) depths.right = Math.max(depths.right, extent)
      anchors.set(key, { lane: prior.lane + 1, extent })
      continue
    }
    if (rule.type === 'nonogram') {
      const key = `nonogram-${rule.axis}-${rule.index}`
      const prior = anchors.get(key) ?? { lane: 0, extent: 0 }
      const label = rule.runs.join(' ')
      const gap = .18
      const glyphWidth = rule.axis === 'row' ? label.length * .2 : .36
      const offset = prior.extent + gap + glyphWidth / 2
      const x = rule.axis === 'row' ? -(prior.extent + gap) : rule.index + .5
      const y = rule.axis === 'column' ? -offset : rule.index + .5
      clues.push({ rule, lane: prior.lane, x, y, dr: 0, dc: 0, label })
      const extent = rule.axis === 'row' ? prior.extent + gap + glyphWidth : offset + glyphWidth / 2
      if (rule.axis === 'column') depths.top = Math.max(depths.top, extent)
      else depths.left = Math.max(depths.left, extent)
      anchors.set(key, { lane: prior.lane + 1, extent })
      continue
    }
    if (rule.type !== 'sandwich' && rule.type !== 'little-killer' && rule.type !== 'x-sum' && rule.type !== 'skyscrapers' && rule.type !== 'crust-clue') continue
    const [dr, dc] = clueDelta(rule.direction),
      first = rule.cells[0]
    const ox = (first % size) + 0.5 - dc,
      oy = Math.floor(first / size) + 0.5 - dr
    const key = `${ox},${oy}`,
      prior = anchors.get(key) ?? { lane: 0, extent: 0 }
    if (rule.type !== 'little-killer') {
      const x = (first % size) + 0.5 - dc * (0.85 + prior.extent),
        y = Math.floor(first / size) + 0.5 - dr * (0.85 + prior.extent)
      const family = rule.type === 'crust-clue' ? 'crust-clue' : rule.type
      const label = (legend.length ? ORTHOGONAL_CLUES[family].prefix : '') + (rule.type === 'skyscrapers' ? rule.count : rule.type === 'crust-clue' ? rule.sum : rule.sum)
      const secondaryLabel = rule.type === 'crust-clue' && rule.crossed !== undefined ? String(rule.crossed) : undefined
      clues.push({ rule, lane: prior.lane, x, y, dr, dc, label, ...(secondaryLabel !== undefined && { secondaryLabel }) })
      const extent = prior.extent + (legend.length ? 0.9 : secondaryLabel !== undefined ? 1.3 : 0.7)
      if (dr === 1) depths.top = Math.max(depths.top, extent)
      if (dr === -1) depths.bottom = Math.max(depths.bottom, extent)
      if (dc === 1) depths.left = Math.max(depths.left, extent)
      if (dc === -1) depths.right = Math.max(depths.right, extent)
      anchors.set(key, { lane: prior.lane + 1, extent })
    } else {
      const x = ox - dc * prior.extent,
        y = oy - dr * prior.extent
      const label = { x: x - dc * 0.18, y: y - dr * 0.18 }
      clues.push({
        rule,
        lane: prior.lane,
        ...label,
        dr,
        dc,
        label: String(rule.sum),
        arrow: { x1: x + dc * 0.2, y1: y + dr * 0.2, x2: x + dc * 0.45, y2: y + dr * 0.45 },
      })
      // Include the complete glyph and arrow in the gutters, including corner clues.
      depths.left = Math.max(depths.left, -label.x + 0.45)
      depths.right = Math.max(depths.right, label.x + 0.45 - size)
      depths.top = Math.max(depths.top, -label.y + 0.3)
      depths.bottom = Math.max(depths.bottom, label.y + 0.3 - size)
      anchors.set(key, { lane: prior.lane + 1, extent: prior.extent + 1.2 })
    }
  }
  for (const side of Object.keys(depths) as OutsideSide[])
    depths[side] = Math.max(0, Math.ceil((depths[side] - 1e-10) * 10) / 10)
  return { clues, depths, legend }
}
