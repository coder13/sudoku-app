import type { VariantRule } from '../engine.ts'
import { isHexColor, type ImportedCellColors } from '../imported-colors.ts'

const cloneRulesets = [
  /^normal sudoku rules apply\. regions of the same shape and colou?r must contain identical digits in identical positions\.$/i,
  /^normal sudoku rules apply\. clone: regions of the same shape\/orientation\/colou?r are clones, and must contain the same digits in the same relative positions\.(?: view gas on gmpuzzles: https:\/\/www\.gmpuzzles\.com\/blog\/tag\/gas\/)?$/i,
]

export function hasColoredCloneRuleset(text: unknown) {
  return typeof text === 'string' && cloneRulesets.some(rule => rule.test(text.trim().replace(/\s+/g, ' ')))
}

export function cloneCellColor(cell: Record<string, unknown>) {
  const { c, cArray } = cell
  if (c !== undefined && !isHexColor(c) ||
    cArray !== undefined && (!Array.isArray(cArray) || cArray.length > 1 || cArray.some(shade => !isHexColor(shade)))) {
    throw new Error('This f-puzzles Clone export needs one color per marked cell.')
  }
  const shade = typeof c === 'string' ? c.toLowerCase() : undefined
  const firstLayer = Array.isArray(cArray) ? cArray[0] : undefined
  const layer = typeof firstLayer === 'string' ? firstLayer.toLowerCase() : undefined
  if (shade && layer && shade !== layer) throw new Error('This f-puzzles Clone export has conflicting cell colors.')
  return shade ?? layer
}

function shapeKey(cells: readonly number[]) {
  const first = cells[0]
  const row = Math.floor(first / 9), column = first % 9
  return cells.map(cell => `${Math.floor(cell / 9) - row},${cell % 9 - column}`).join(';')
}

export function coloredCloneShapes(colors: ReadonlyMap<number, string>) {
  const remaining = new Set(colors.keys())
  const copies = new Map<string, number[][]>()
  const outlines = new Set<string>()
  const givenCellColors: ImportedCellColors = {}
  for (const [cell, color] of colors) givenCellColors[cell] = [color]
  for (const start of remaining) {
    const color = colors.get(start)!
    remaining.delete(start)
    const shape = [start]
    for (const cell of shape) {
      const adjacent = [cell - 9, cell + 9]
      if (cell % 9 > 0) adjacent.push(cell - 1)
      if (cell % 9 < 8) adjacent.push(cell + 1)
      for (const neighbor of adjacent) {
        if (colors.get(neighbor) === color && remaining.delete(neighbor)) shape.push(neighbor)
      }
    }
    shape.sort((a, b) => a - b)
    const key = color + ':' + shapeKey(shape)
    const matches = copies.get(key) ?? []
    matches.push(shape)
    copies.set(key, matches)
    outlines.add(shape.join(','))
  }
  if (!copies.size || [...copies.values()].some(shapes => shapes.length < 2)) {
    throw new Error('This f-puzzles Clone export has a colored shape without a matching copy.')
  }
  const rules: VariantRule[] = [...copies.values()].map(shapes => ({
    type: 'clone', groups: shapes[0].map((_, index) => shapes.map(copy => copy[index])),
  }))
  return { rules, outlines, givenCellColors }
}
