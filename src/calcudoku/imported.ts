import { encodeLatinMinMax, readLatinMinMax } from '../latin/min-max.ts'
import { encodeLatinDiagonals, readLatinDiagonals } from '../latin/diagonals.ts'
import { encodeAdjacentClues, readAdjacentClues } from '../latin/adjacent-clues.ts'
import type { Inequality } from '../futoshiki/inequality-rules.ts'
import { encodeNumberImportAnnotations, hasPlayerNumberAnnotations, readNumberImportAnnotations, type NumberImportAnnotations } from '../number-puzzles/imported-annotations.ts'
import { encodeNumberImportPosition, readNumberImportPosition, withImportedNumberPosition } from '../number-puzzles/imported-position.ts'
import type { NumberPosition } from '../number-puzzles/progress.ts'
import { isImportedColor } from '../sudoku/imported-colors.ts'
import { encodeWhispers, readWhispers } from '../latin/whispers.ts'
import { encodeLatinParity, readLatinParity } from '../latin/parity.ts'
import { encodeLatinQuadruples, readLatinQuadruples } from '../latin/quadruples.ts'
import { encodeLatinCellGroups, readLatinCellGroups } from '../latin/extra-regions.ts'
import { encodeLatinPathClues, readLatinPathClues, type LatinClues } from '../latin/path-clues.ts'
import { cellLabel, solveLatin } from '../latin/engine.ts'
import type { CalcudokuEntry } from './catalog.ts'
import { createCalcudoku, type Cage, type CageOperator } from './engine.ts'
import { matchImportedCalcudoku } from './import-token.ts'

export { importedCalcudokuToken } from './import-token.ts'

export type CalcudokuImportCage = {
  label: string
  cells: number[]
  operator?: CageOperator
  distinct?: true
}

export type CalcudokuImport = LatinClues & {
  size: number
  givens: string
  cages: CalcudokuImportCage[]
  colors: string[]
  inequalities?: readonly Inequality[]
  position?: NumberPosition
  annotations?: NumberImportAnnotations
}

const signs = new Map<string, CageOperator>([
  ['+', 'add'], ['x', 'multiply'], ['X', 'multiply'], ['×', 'multiply'], ['*', 'multiply'],
  ['-', 'subtract'], ['−', 'subtract'], ['÷', 'divide'], ['/', 'divide'],
])
export const importedOperatorNames = {
  equal: 'Fixed digit', add: 'Addition', multiply: 'Multiplication', subtract: 'Subtraction', divide: 'Division',
} satisfies Record<CageOperator, string>
// Portable links from before the shared Coach color reader also allowed these CSS colors.
const legacyColors = new Set(['black', 'brown', 'gray', 'pink', 'turquoise', 'teal'])
const twoCellOperators = ['add', 'multiply', 'subtract', 'divide'] as const
const multiCellOperators = ['add', 'multiply'] as const

export function calcudokuImportOperators(cage: CalcudokuImportCage): readonly CageOperator[] {
  return cage.cells.length === 2 ? twoCellOperators : multiCellOperators
}

function importedCage(label: unknown, cells: unknown, distinct: boolean, size: number): CalcudokuImportCage {
  if (typeof label !== 'string' || !/^[1-9][0-9]{0,4}(?:[+xX×*−÷/-])?$/.test(label) ||
    !Array.isArray(cells) || cells.length < 1 || cells.length > 5 ||
    cells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size ** 2)) {
    throw new Error('This Sudoku Coach puzzle has an unsupported Calcudoku cage.')
  }
  const sign = signs.get(label.at(-1)!)
  if (distinct && sign || sign && cells.length === 1) throw new Error('This Sudoku Coach puzzle has an invalid cage operation.')
  const operator = distinct ? 'add' : cells.length === 1 ? 'equal' : sign
  return { label, cells: [...cells].sort((a, b) => a - b), operator, ...(distinct && { distinct: true }) }
}

function assertSizeAndGivens(size: unknown, givens: unknown): asserts size is number {
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 3 || size > 9 ||
    typeof givens !== 'string' || givens.length !== size ** 2 || !/^\d+$/.test(givens) ||
    [...givens].some(digit => Number(digit) > size)) {
    throw new Error('This Calcudoku puzzle has invalid givens.')
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function readCoachCalcudoku(
  data: Record<string, unknown>, colors: string[], inequalities: readonly Inequality[], clues: LatinClues,
): CalcudokuImport {
  const size = data.gridSize
  const givens = data.givenDigits ?? (typeof size === 'number' ? '0'.repeat(size ** 2) : undefined)
  assertSizeAndGivens(size, givens)
  const cages: CalcudokuImportCage[] = []
  if (!Array.isArray(data.givenConstraints)) throw new Error('This Sudoku Coach puzzle has no Calcudoku cages.')
  for (const layer of data.givenConstraints) {
    if (!record(layer) || layer.type !== 'cage' && layer.type !== 'cosmeticCage') {
      throw new Error('This Sudoku Coach puzzle combines Calcudoku cages with an unsupported rule.')
    }
    if (!Array.isArray(layer.segments) || !layer.segments.length ||
      layer.settings !== undefined && (!record(layer.settings) || Object.keys(layer.settings).length > 0)) {
      throw new Error('This Sudoku Coach cage layer has unsupported settings.')
    }
    for (const segment of layer.segments) {
      if (!record(segment) || !record(segment.parameters) || Object.keys(segment.parameters).length !== 1) {
        throw new Error('This Sudoku Coach puzzle has an invalid cage label.')
      }
      const distinct = layer.type === 'cage'
      const sum = segment.parameters.sum
      if (distinct ? !Number.isSafeInteger(sum) : typeof sum !== 'string') {
        throw new Error('This Sudoku Coach puzzle has an invalid cage label.')
      }
      cages.push(importedCage(String(sum), segment.cells, distinct, size))
      if (cages.length > size ** 2) throw new Error('This Sudoku Coach puzzle has too many cages.')
    }
  }
  return { size, givens: givens as string, cages, colors: colors.some(Boolean) ? colors : [], inequalities, ...clues }
}

function calcudokuImportEntry(source: CalcudokuImport, operators: Readonly<Partial<Record<number, CageOperator>>>): CalcudokuEntry {
  const { size, givens, colors, annotations, adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing, diagonals, minMax } = source
  const fixed = [...givens].map(Number)
  const labels: Record<number, string> = {}
  const ruleNotes: string[] = []
  const recipe: [string, number[], CageOperator, boolean][] = []
  const cages: Cage[] = []
  for (const cage of source.cages.slice().sort((a, b) => a.cells[0] - b.cells[0])) {
    const anchor = cage.cells[0]
    const operator = cage.operator ?? operators[anchor]
    if (!operator || !cage.operator && !calcudokuImportOperators(cage).includes(operator)) {
      throw new Error('Choose an operation for each cage with no sign.')
    }
    const target = Number.parseInt(cage.label, 10)
    const distinct = cage.distinct === true
    recipe.push([cage.label, cage.cells, operator, distinct])
    labels[anchor] = cage.label
    cages.push({ cells: cage.cells, target, operator, ...(distinct && { distinct: true }) })
    if (!cage.operator) ruleNotes.push(`The ${cage.label} cage at ${cellLabel(anchor, size)} uses ${importedOperatorNames[operator].toLowerCase()}.`)
    if (distinct && cage.cells.length > 1) {
      ruleNotes.push(`Digits cannot repeat in the ${cage.label} cage at ${cellLabel(anchor, size)}.`)
    }
  }
  const covered = new Set(cages.flatMap(cage => cage.cells))
  for (const [cell, target] of fixed.entries()) {
    if (target && !covered.has(cell)) cages.push({ cells: [cell], target, operator: 'equal' })
  }
  const inequalities = [...(source.inequalities ?? [])].sort((a, b) => a.less - b.less || a.greater - b.greater)
  const puzzle = createCalcudoku(size, cages, fixed, { allowUncaged: true, inequalities, adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, globalEntropy, quadruples, parity, antiKnight, antiKing, diagonals, minMax })
  if (inequalities.length) ruleNotes.push('The point of each inequality sign faces the smaller digit.')
  // Each cell index occupies two base-36 characters.
  const signs = inequalities.map(({ less, greater }) => [less, greater]
    .map(cell => cell.toString(36).padStart(2, '0')).join('')).join('')
  const rules = signs ? `.i${signs}` : ''
  const bytes = new TextEncoder().encode(JSON.stringify([size, givens, recipe, colors]))
  const payload = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  const progress = withImportedNumberPosition(source.position, puzzle.givens, hasPlayerNumberAnnotations(annotations))
  return {
    id: `c1.${payload}${rules}${encodeAdjacentClues(adjacentClues)}${encodeWhispers(whispers)}${encodeLatinPathClues(pathClues)}${encodeLatinCellGroups('r', extraRegions)}${encodeLatinCellGroups('u', unnumberedCages)}${globalEntropy ? '.e1' : ''}${encodeLatinQuadruples(quadruples)}${encodeLatinParity(size, parity)}${antiKnight ? '.k1' : ''}${antiKing ? '.j1' : ''}${encodeLatinDiagonals(diagonals)}${encodeLatinMinMax(minMax)}${encodeNumberImportPosition(progress.initialPosition)}${encodeNumberImportAnnotations(annotations)}`, number: 0, difficulty: size <= 3 ? 'easy' : size === 4 ? 'medium' : 'hard',
    imported: true, puzzle, cageLabels: labels, cellColors: colors, ruleNotes, annotations, ...progress,
  }
}

export function verifyImportedCalcudoku(entry: CalcudokuEntry) {
  const { status } = solveLatin(entry.puzzle)
  if (status === 'multiple') throw new Error('This Calcudoku puzzle has more than one solution.')
  if (status === 'unsolvable') throw new Error('This Calcudoku puzzle has no solution.')
  if (status === 'search-limit') throw new Error('The app could not check whether this Calcudoku puzzle has one solution.')
  return entry
}

export function prepareImportedCalcudoku(source: CalcudokuImport, operators: Readonly<Partial<Record<number, CageOperator>>> = {}) {
  return verifyImportedCalcudoku(calcudokuImportEntry(source, operators))
}

export function readImportedCalcudoku(token: string): CalcudokuEntry | undefined {
  const match = matchImportedCalcudoku(token)
  if (!match) return
  try {
    const [, payload, signs, adjacent, whisperLines, paths, regions, unnumbered, entropy, quadClues, parityMarks, antiKnight, antiKing, diagonalMask, extrema, progress, marks] = match
    const bytes = Uint8Array.from(atob(payload.replaceAll('-', '+').replaceAll('_', '/')), value => value.charCodeAt(0))
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!Array.isArray(data) || data.length !== 4) return
    const [size, givens, recipe, colors] = data
    assertSizeAndGivens(size, givens)
    if (!Array.isArray(recipe) || recipe.length > size ** 2 || !Array.isArray(colors) ||
      colors.length && colors.length !== size ** 2 ||
      colors.some(color => color !== '' && !isImportedColor(color) && !legacyColors.has(color))) return
    const operators: Record<number, CageOperator> = {}
    const cages = recipe.map((item: unknown) => {
      if (!Array.isArray(item) || item.length !== 4 || typeof item[3] !== 'boolean') throw new Error('Invalid cage.')
      const cage = importedCage(item[0], item[1], item[3], size)
      // Older links treated single-cell Killer totals as givens.
      if (item[3] && cage.cells.length === 1 && item[2] === 'equal') cage.operator = 'equal'
      operators[cage.cells[0]] = item[2]
      return cage
    })
    const inequalities = signs?.match(/.{4}/g)?.map(edge => ({
      less: Number.parseInt(edge.slice(0, 2), 36), greater: Number.parseInt(edge.slice(2), 36),
    }))
    const position = progress ? readNumberImportPosition(progress, size) : undefined
    const annotations = marks ? readNumberImportAnnotations(marks, size) : undefined
    const adjacentClues = adjacent ? readAdjacentClues(adjacent) : undefined
    const whispers = whisperLines ? readWhispers(whisperLines) : undefined
    const pathClues = paths ? readLatinPathClues(paths) : undefined
    const extraRegions = regions ? readLatinCellGroups(regions) : undefined
    const unnumberedCages = unnumbered ? readLatinCellGroups(unnumbered) : undefined
    const entry = calcudokuImportEntry({
      size, givens, cages, colors, inequalities, adjacentClues, whispers, pathClues, extraRegions, unnumberedCages, position, annotations,
      globalEntropy: entropy ? true : undefined,
      quadruples: quadClues ? readLatinQuadruples(quadClues) : undefined,
      parity: parityMarks ? readLatinParity(size, parityMarks) : undefined,
      antiKnight: antiKnight ? true : undefined,
      antiKing: antiKing ? true : undefined,
      diagonals: readLatinDiagonals(diagonalMask),
      minMax: extrema ? readLatinMinMax(extrema) : undefined,
    }, operators)
    if (entry.id === token) return entry
  } catch { /* Invalid import link. */ }
}
