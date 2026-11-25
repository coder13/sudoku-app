import type { EquationOperator, SizedConstraintRule } from '../engine.ts'
import { validRowEquation } from '../row-equation.ts'

// The original 5×5 export stores its active equations as cosmetic outlines and text.
const ROW_EQUATION_DRAWING = '699bcfd4dda47d7c8fe999a77e67a12742662b39288987cd1ac241c281465f11'

type Drawing = {
  type: string
  settings: Record<string, unknown>
  segments: { cells: unknown[]; parameters: Record<string, unknown> }[]
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const fields = item as Record<string, unknown>
    return Object.fromEntries(Object.keys(fields).sort().map(key => [key, fields[key]]))
  })
}

async function digest(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

const symbols = new Map<string, EquationOperator>([
  ['+', 'add'], ['-', 'subtract'], ['*', 'multiply'], ['÷', 'divide'], ['=', 'equals'],
])

function readRowEquations(layers: readonly Drawing[], size: number): SizedConstraintRule[] | undefined {
  const marks = new Map<number, EquationOperator>()
  for (const layer of layers.filter(({ type }) => type === 'cosmeticText')) {
    for (const { cells, parameters } of layer.segments) {
      if (!Array.isArray(cells) || cells.length !== 1 || !Array.isArray(cells[0]) || cells[0].length !== 2) return
      const [x, y] = cells[0]
      const symbol = symbols.get(String(parameters.text ?? ''))
      if (!symbol || typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) ||
        x < 0 || x >= size || y % 1 !== .5 || y < .5 || y >= size || marks.has(Math.floor(y) * size + x)) return
      marks.set(Math.floor(y) * size + x, symbol)
    }
  }
  const rules = layers.filter(({ type }) => type === 'cosmeticCage').flatMap(layer => layer.segments.map(segment => {
    if (!Array.isArray(segment.cells) || !segment.cells.every(cell => Number.isInteger(cell) && Number(cell) >= 0 && Number(cell) < size ** 2)) return undefined
    const cells = [...segment.cells] as number[]
    cells.sort((a, b) => a - b)
    const operators = cells.slice(1).map(cell => {
      const operator = marks.get(cell)
      marks.delete(cell)
      return operator ?? 'join'
    })
    const rule: SizedConstraintRule = { type: 'row-equation', cells, operators }
    return validRowEquation(rule, size) ? rule : undefined
  }))
  if (marks.size || !rules.length || rules.some(rule => !rule)) return
  return (rules as SizedConstraintRule[]).sort((a, b) =>
    (a.type === 'row-equation' ? a.cells[0] : 0) - (b.type === 'row-equation' ? b.cells[0] : 0))
}

/** Parse only the exact reviewed Coach drawing whose arithmetic meaning is documented. */
export async function readReviewedCoachRowEquations(value: unknown, size: number): Promise<SizedConstraintRule[] | undefined> {
  if (!globalThis.crypto?.subtle || !Array.isArray(value) || size !== 5 || !value.every(record)) return
  const layers = value.filter((layer): layer is Drawing =>
    (layer.type === 'cosmeticCage' || layer.type === 'cosmeticText') && record(layer.settings) && Array.isArray(layer.segments) &&
    layer.segments.every(segment => record(segment) && Array.isArray(segment.cells) && record(segment.parameters)))
  if (layers.length !== value.filter(layer => record(layer) && (layer.type === 'cosmeticCage' || layer.type === 'cosmeticText')).length ||
    new Set(layers.map(layer => layer.type)).size !== 2 || await digest(layers) !== ROW_EQUATION_DRAWING) return
  return readRowEquations(layers, size)
}
