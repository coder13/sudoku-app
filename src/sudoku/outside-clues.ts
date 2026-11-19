import type { VariantRule } from './engine.ts'

export type OutsideRule = Extract<VariantRule, { type: 'sandwich' | 'little-killer' | 'x-sum' }>
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
export function validOutsideRay(cells: readonly number[], direction: string, diagonal = false) {
  if (typeof direction !== 'string' || !Array.isArray(cells) || !cells.length || !Object.hasOwn(DELTAS, direction)) return false
  const [dr, dc] = DELTAS[direction as Direction]
  if (Boolean(dr && dc) !== diagonal) return false
  const first = cells[0]
  if (!Number.isInteger(first) || first < 0 || first >= 81) return false
  let row = Math.floor(first / 9),
    column = first % 9
  const inside = (r: number, c: number) => r >= 0 && r < 9 && c >= 0 && c < 9
  if (inside(row - dr, column - dc)) return false
  for (const cell of cells) {
    if (!inside(row, column) || cell !== row * 9 + column) return false
    row += dr
    column += dc
  }
  return !inside(row, column)
}

const cellName = (cell: number) => `R${Math.floor(cell / 9) + 1}C${(cell % 9) + 1}`
export function outsideClueLabel(rule: OutsideRule) {
  if (rule.type === 'little-killer')
    return `Little Killer ${rule.sum}, ${rule.direction.replace('-', ' ')} from ${cellName(rule.cells[0])} to ${cellName(rule.cells[rule.cells.length - 1])}: all indicated digits sum to ${rule.sum}. Digits may repeat if the other puzzle rules allow it.`
  const side =
    rule.direction === 'south'
      ? 'top'
      : rule.direction === 'north'
        ? 'bottom'
        : rule.direction === 'east'
          ? 'left'
          : 'right'
  const location = `${side} of ${side === 'top' || side === 'bottom' ? 'column ' + ((rule.cells[0] % 9) + 1) : 'row ' + (Math.floor(rule.cells[0] / 9) + 1)}`
  return rule.type === 'x-sum'
    ? `X-Sum ${rule.sum}, ${location}: the first digit counts how many cells to add, including itself, starting at ${cellName(rule.cells[0])}.`
    : `Sandwich ${rule.sum}, ${location}: digits strictly between 1 and 9 sum to ${rule.sum}; 1 and 9 are excluded.`
}

/** Prefix otherwise ambiguous outside totals when both orthogonal rule families are present. */
export function outsideClueLegend(rules?: readonly VariantRule[]) {
  return rules?.some(rule => rule.type === 'sandwich') && rules.some(rule => rule.type === 'x-sum')
    ? ['S = Sandwich', 'X = X-Sums'] : []
}

/** Lay out all edge and corner labels in cell coordinates. Repeated anchors move outward along their ray. */
export function outsideClueLayout(rules?: readonly VariantRule[]) {
  const clues: {
    rule: OutsideRule
    lane: number
    x: number
    y: number
    dr: number
    dc: number
    label: string
    arrow?: { x1: number; y1: number; x2: number; y2: number }
  }[] = []
  const depths = { top: 0, right: 0, bottom: 0, left: 0 }
  const legend = outsideClueLegend(rules)
  const anchors = new Map<string, { lane: number; extent: number }>()
  for (const rule of rules ?? []) {
    if (rule.type !== 'sandwich' && rule.type !== 'little-killer' && rule.type !== 'x-sum') continue
    const [dr, dc] = clueDelta(rule.direction),
      first = rule.cells[0]
    const ox = (first % 9) + 0.5 - dc,
      oy = Math.floor(first / 9) + 0.5 - dr
    const key = `${ox},${oy}`,
      prior = anchors.get(key) ?? { lane: 0, extent: 0 }
    if (rule.type !== 'little-killer') {
      const x = (first % 9) + 0.5 - dc * (0.85 + prior.extent),
        y = Math.floor(first / 9) + 0.5 - dr * (0.85 + prior.extent)
      const label = (legend.length ? rule.type === 'sandwich' ? 'S' : 'X' : '') + rule.sum
      clues.push({ rule, lane: prior.lane, x, y, dr, dc, label })
      const extent = prior.extent + (legend.length ? 0.9 : 0.7)
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
      depths.right = Math.max(depths.right, label.x + 0.45 - 9)
      depths.top = Math.max(depths.top, -label.y + 0.3)
      depths.bottom = Math.max(depths.bottom, label.y + 0.3 - 9)
      anchors.set(key, { lane: prior.lane + 1, extent: prior.extent + 1.2 })
    }
  }
  for (const side of Object.keys(depths) as OutsideSide[])
    depths[side] = Math.max(0, Math.ceil((depths[side] - 1e-10) * 10) / 10)
  return { clues, depths, legend }
}
