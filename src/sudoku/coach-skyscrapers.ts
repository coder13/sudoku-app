import type { SizedSkyscrapersRule } from './engine.ts'

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

// Cosmetic text only has rule meaning when the published author explains it.
const rulesText = /^Skyscrapers: Digits displayed on the grid also represent heights of "skyscrapers"\. Larger values being taller skyscrapers than smaller ones\. Clues outside the grid indicate the number of "skyscrapers" visible from that direction\.$/

export function coachSkyscrapersRules(constraints: readonly unknown[], size: number, description?: string): SizedSkyscrapersRule[] {
  const labels = constraints.filter(layer => record(layer) && layer.type === 'cosmeticText')
  if (!rulesText.test(description?.trim() ?? '')) {
    if (labels.length) throw new Error(description === undefined
      ? 'This Sudoku Coach export has text around the grid. Use the published puzzle link so the app can read the author’s rules.'
      : 'This Sudoku Coach puzzle has authored text the importer cannot verify.')
    return []
  }
  const clues = new Map<string, SizedSkyscrapersRule>()
  for (const layer of labels) {
    if (!record(layer) || Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !Array.isArray(layer.segments) || layer.settings !== undefined && (!record(layer.settings) ||
        Object.keys(layer.settings).some(key => !['gridZoomOut', 'colour'].includes(key)) ||
        layer.settings.gridZoomOut !== undefined && typeof layer.settings.gridZoomOut !== 'number' ||
        layer.settings.colour !== undefined && typeof layer.settings.colour !== 'string')) {
      throw new Error('Invalid Sudoku Coach Skyscrapers clues.')
    }
    for (const segment of layer.segments) {
      if (!record(segment) || Object.keys(segment).some(key => !['cells', 'parameters'].includes(key)) ||
        !record(segment.parameters) || Object.keys(segment.parameters).length !== 1 ||
        typeof segment.parameters.text !== 'string' || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
        !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
        !segment.cells[0].every(value => typeof value === 'number')) {
        throw new Error('Invalid Sudoku Coach Skyscrapers clue.')
      }
      const [x, y] = segment.cells[0]
      const text = segment.parameters.text.trim()
      if (!Number.isFinite(x) || !Number.isFinite(y) || !/^[1-9]\d?$/.test(text) || Number(text) > size) {
        throw new Error('A Sudoku Coach Skyscrapers count must be a positive whole number beside a grid row or column.')
      }
      let direction: SizedSkyscrapersRule['direction']
      let index: number
      if (y === -0.5 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= size - 0.5) {
        direction = 'north'; index = x - 0.5
      } else if (y === size + 0.5 && Number.isInteger(x - 0.5) && x >= 0.5 && x <= size - 0.5) {
        direction = 'south'; index = x - 0.5
      } else if (x === size + 0.5 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= size - 0.5) {
        direction = 'east'; index = y - 0.5
      } else if (x === -0.5 && Number.isInteger(y - 0.5) && y >= 0.5 && y <= size - 0.5) {
        direction = 'west'; index = y - 0.5
      } else throw new Error('A Sudoku Coach Skyscrapers count must be beside a grid row or column.')
      const clue = { type: 'skyscrapers' as const, direction, index, count: Number(text) }
      const key = `${direction}:${index}`
      if (clues.has(key)) throw new Error('Two Sudoku Coach Skyscrapers counts share one side of a row or column.')
      clues.set(key, clue)
    }
  }
  if (!clues.size) throw new Error('The Sudoku Coach Skyscrapers puzzle is missing its outside counts.')
  return [...clues.values()]
}
