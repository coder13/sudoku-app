import type { SizedNonogramRule } from './engine.ts'

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

// Coach's free text has no constraint tag. Require the published author rule
// before interpreting positioned numbers as run lengths.
const rulesText = /^Fill the (?<rows>\d+)[×x](?<columns>\d+) grid with numbers 1 to (?<maximum>\d+) so that:\s*Each number appears exactly once per row and once per column \(Latin square rule\)\.\s*Numbers outside the grid indicate groups of consecutive (?<parity>even|odd) numbers \((?<digits>\d+(?:, \d+)*)\) in that row or column\.\s*(?:\(For example, a clue "(?<example>\d+) 1" means a group of \k<example> \k<parity> numbers followed later by a single \k<parity> number\.\)\s*)?Groups of \k<parity> numbers are separated by at least one (?<separatorParity>even|odd) number \((?<separators>\d+(?:, \d+)*)\)\.$/i

export function coachNonogramRules(constraints: readonly unknown[], size: number, description?: string) {
  const labels = constraints.filter(layer => record(layer) && layer.type === 'cosmeticText')
  for (const layer of labels) {
    const allowedSettings = ['gridResolution', 'textSize', 'colour', 'opacity', 'borderColour', 'borderThickness']
    if (!record(layer) || Object.keys(layer).some(key => !['id', 'type', 'segments', 'settings'].includes(key)) ||
      !Array.isArray(layer.segments) ||
      layer.settings !== undefined && (!record(layer.settings) || Object.keys(layer.settings).some(key => !allowedSettings.includes(key)) ||
        layer.settings.gridResolution !== undefined && (typeof layer.settings.gridResolution !== 'number' || !Number.isInteger(layer.settings.gridResolution) || layer.settings.gridResolution < 1) ||
        layer.settings.textSize !== undefined && (typeof layer.settings.textSize !== 'number' || !Number.isFinite(layer.settings.textSize) || layer.settings.textSize <= 0))) {
      throw new Error('This Sudoku Coach Nonogram text layer has unsupported settings.')
    }
  }
  const match = description === undefined ? undefined : rulesText.exec(description.trim())?.groups
  if (!match) {
    if (labels.length) throw new Error(description === undefined
      ? 'This Sudoku Coach export has text around the grid. Use the published puzzle link so the app can read the author’s rules.'
      : 'This Sudoku Coach puzzle has authored text the importer cannot verify.')
    return []
  }
  const digits = match.digits.split(', ').map(Number)
  const separators = match.separators.split(', ').map(Number)
  const expected = Array.from({ length: size }, (_, index) => index + 1)
  if ([match.rows, match.columns, match.maximum].some(dimension => Number(dimension) !== size) ||
    digits.join() !== expected.filter(digit => digit % 2 === (match.parity.toLowerCase() === 'odd' ? 1 : 0)).join() ||
    separators.join() !== expected.filter(digit => !digits.includes(digit)).join() ||
    match.parity.toLowerCase() === match.separatorParity.toLowerCase()) {
    throw new Error('This Sudoku Coach Nonogram uses an unsupported digit group.')
  }
  const lines = new Map<string, { axis: SizedNonogramRule['axis']; index: number; labels: Map<number, number> }>()
  for (const layer of labels) {
    if (!record(layer) || !Array.isArray(layer.segments)) throw new Error('Invalid Sudoku Coach Nonogram clues.')
    for (const segment of layer.segments) {
      if (!record(segment) || !record(segment.parameters) || !Array.isArray(segment.cells) || segment.cells.length !== 1 ||
        !Array.isArray(segment.cells[0]) || segment.cells[0].length !== 2 ||
        typeof segment.parameters.text !== 'string' || Object.keys(segment.parameters).length !== 1) {
        throw new Error('Invalid Sudoku Coach Nonogram clue.')
      }
      if (Object.keys(segment).some(key => key !== 'cells' && key !== 'parameters')) {
        throw new Error('This Sudoku Coach Nonogram clue has unsupported segment fields.')
      }
      const [x, y] = segment.cells[0]
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid Sudoku Coach Nonogram clue position.')
      const text = segment.parameters.text.trim()
      if (!text) continue
      const left = x >= -1 && x < 0 && Number.isInteger(y - .5) && y > 0 && y < size
      const top = y >= -1 && y < 0 && Number.isInteger(x - .5) && x > 0 && x < size
      if ((!left && !top) || !/^[1-9]\d?$/.test(text) || Number(text) > size) {
        throw new Error('A Sudoku Coach Nonogram count must be a positive whole number to the left of a row or above a column.')
      }
      const axis = left ? 'row' : 'column'
      const index = Math.floor(left ? y : x), distance = left ? x : y
      const key = `${axis}-${index}`
      const line = lines.get(key) ?? { axis, index, labels: new Map<number, number>() }
      if (line.labels.has(distance)) throw new Error('Two Sudoku Coach Nonogram counts share a position.')
      line.labels.set(distance, Number(text))
      lines.set(key, line)
    }
  }
  if (!lines.size) throw new Error('The Sudoku Coach Nonogram is missing its run counts.')
  return [...lines.values()].sort((a, b) => (a.axis === b.axis ? a.index - b.index : a.axis === 'row' ? -1 : 1))
    .map(({ axis, index, labels }): SizedNonogramRule => ({
      type: 'nonogram', axis, index, digits,
      runs: [...labels].sort(([a], [b]) => a - b).map(([, count]) => count),
    }))
}
