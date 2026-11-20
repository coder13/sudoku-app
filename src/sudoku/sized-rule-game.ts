import { runEngine, type MarkedPairs, type SizedConstraintPosition, type SizedConstraintRule } from './engine.ts'
import { conflictsOf } from './game.ts'
import { isGridText, gridCellsShareEdge, gridDiagonalCells, kropkiDigitExclusions, sizedClassicPosition, type SizedGrid } from './grid.ts'
import { sizedRegionSumParts } from './region-sum.ts'
import { sizedKillerState, validSizedKillerRule } from './sized-killer.ts'
import { validation } from './puzzle-validation.ts'

export type SizedRuleDefinition = { grid: SizedGrid; givens: string; rules: readonly SizedConstraintRule[]; author?: string; authoredSolution?: string }
export type SizedRuleGame = Pick<SizedRuleDefinition, 'rules' | 'author'> & { solution: string }

export function isSizedRuleAuthor(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 72
}

function validKropkiMarks(value: unknown, size: number): value is MarkedPairs {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => key !== 'pairs' && key !== 'negative')) return false
  const { negative, pairs } = value as MarkedPairs
  return (negative === undefined || typeof negative === 'boolean') &&
    (pairs === undefined || Array.isArray(pairs) && pairs.length <= 2 * size * (size - 1) &&
      pairs.every(pair => Array.isArray(pair) && pair.length === 2 &&
        pair.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2) &&
        gridCellsShareEdge(pair[0], pair[1], size)))
}

export function isSizedRuleList(value: unknown, grid: SizedGrid): value is SizedRuleDefinition['rules'] {
  const { size } = grid
  if (!Array.isArray(value) || value.length > 128) return false
  const occupiedCages = new Set<number>()
  return value.every(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false
    if (rule.type === 'killer-cages') return validSizedKillerRule(rule, size, occupiedCages)
    if (rule.type === 'diagonal') {
      return Object.keys(rule).length === 2 && (rule.diagonal === 'main' || rule.diagonal === 'anti')
    }
    if (rule.type === 'kropki') {
      return Object.keys(rule).every(key => ['type', 'consecutive', 'ratioTwo'].includes(key)) &&
        [rule.consecutive, rule.ratioTwo].every(marks => marks === undefined || validKropkiMarks(marks, size))
    }
    if (rule.type === 'labeled-dots') {
      const ratio = rule.relation === 'ratio'
      return Object.keys(rule).every(key => ['type', 'relation', 'marks', 'negative'].includes(key)) &&
        (ratio || rule.relation === 'difference') &&
        (rule.negative === undefined || typeof rule.negative === 'boolean') &&
        Array.isArray(rule.marks) && rule.marks.length <= 2 * size * (size - 1) &&
        (rule.marks.length > 0 || rule.negative === true) && rule.marks.every((mark: { cells?: unknown; value?: unknown }) =>
          mark && typeof mark === 'object' && Object.keys(mark).length === 2 &&
          Array.isArray(mark.cells) && mark.cells.length === 2 &&
          mark.cells.every((cell: unknown) => typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < size ** 2) &&
          gridCellsShareEdge(mark.cells[0], mark.cells[1], size) &&
          typeof mark.value === 'number' && Number.isInteger(mark.value) && (ratio ? mark.value >= 2 && mark.value <= size : mark.value >= 1 && mark.value < size))
    }
    const cells: unknown = rule.cells
    if (!Array.isArray(cells) || cells.length > size ** 2 ||
      !cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2)) return false
    if (rule.type === 'arrow') {
      return Object.keys(rule).length === 3 && cells.length >= 1 && cells.length <= size &&
        Number.isInteger(rule.circle) && rule.circle >= 0 && rule.circle < size ** 2 &&
        !cells.includes(rule.circle) && new Set(cells).size === cells.length
    }
    if (rule.type === 'difference') {
      return Object.keys(rule).length === 3 && cells.length === 2 && gridCellsShareEdge(cells[0], cells[1], size) &&
        Number.isInteger(rule.difference) && rule.difference >= 1 && rule.difference < size
    }
    if (rule.type === 'extra-house') return Object.keys(rule).length === 2 && cells.length === size && new Set(cells).size === size
    if (rule.type === 'parity') {
      return Object.keys(rule).length === 3 && cells.length > 0 && (rule.parity === 'even' || rule.parity === 'odd')
    }
    if (!cells.length || new Set(cells).size !== cells.length || (rule.type !== 'region-sum' && cells.length > size)) return false
    if (rule.type === 'thermometer') return Object.keys(rule).length === 2 && cells.length >= 2
    if (rule.type === 'region-sum') {
      if (Object.keys(rule).some(key => !['type', 'cells', 'segments', 'groupByRegion'].includes(key)) ||
        (rule.groupByRegion !== undefined && typeof rule.groupByRegion !== 'boolean') ||
        'noRegions' in grid || sizedRegionSumParts(rule, grid).length < 2) return false
    } else if (rule.type !== 'renban' || Object.keys(rule).some(key => !['type', 'cells', 'segments'].includes(key))) return false
    if (rule.segments === undefined) return true
    const segments: unknown = rule.segments
    if (!Array.isArray(segments) || segments.length === 0 || segments.length > 128 ||
      segments.some(part => !Array.isArray(part) || part.length === 0 || part.length > 128 ||
        part.some(cell => !cells.includes(cell)))) return false
    return new Set(segments.flat()).size === cells.length
  })
}

export function sizedRulePosition(grid: SizedGrid, { rules }: Pick<SizedRuleGame, 'rules'>, values: string): SizedConstraintPosition {
  return { ...sizedClassicPosition(grid, values), grid, rules }
}

export async function verifySizedRulePuzzle({ grid, givens, rules, author, authoredSolution }: SizedRuleDefinition): Promise<SizedRuleGame> {
  if (!isSizedRuleList(rules, grid)) throw new Error('This grid has invalid or unsupported rules.')
  const position = sizedRulePosition(grid, { rules }, givens)
  const result = await runEngine({ type: 'sized-variant', operation: 'solve-unique', position })
  if (result.status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
  if (result.status !== 'unique') throw new Error(validation[result.status].text)
  const solution = result.solution.digits.join('')
  if (authoredSolution !== undefined && solution !== authoredSolution) {
    throw new Error('The authored solution conflicts with the puzzle’s rules.')
  }
  return { rules, solution, ...(isSizedRuleAuthor(author) && { author }) }
}

export function restoreSizedRuleGame({ rules, solution, author }: SizedRuleGame, grid: SizedGrid, givens: string): SizedRuleGame | undefined {
  if (!isSizedRuleList(rules, grid) || (grid.size === 4 && !rules.length) || !isGridText(solution, grid) || solution.includes('0') ||
    Array.from(givens).some((digit, cell) => digit !== '0' && digit !== solution[cell]) ||
    conflictsOf(solution, undefined, grid).size) return
  for (const rule of rules) {
    if (rule.type === 'diagonal') {
      if (new Set(gridDiagonalCells(grid.size, rule.diagonal).map(cell => solution[cell])).size !== grid.size) return
    } else if (rule.type === 'extra-house') {
      if (new Set(rule.cells.map(cell => solution[cell])).size !== grid.size) return
    } else if (rule.type === 'parity') {
      if (rule.cells.some(cell => Number(solution[cell]) % 2 !== (rule.parity === 'odd' ? 1 : 0))) return
    } else if (rule.type === 'renban') {
      const digits = rule.cells.map(cell => Number(solution[cell]))
      if (new Set(digits).size !== digits.length || Math.max(...digits) - Math.min(...digits) !== digits.length - 1) return
    } else if (rule.type === 'region-sum') {
      const totals = sizedRegionSumParts(rule, grid).map(part => part.reduce((total, cell) => total + Number(solution[cell]), 0))
      if (new Set(totals).size !== 1) return
    } else if (rule.type === 'arrow') {
      if (rule.cells.reduce((sum, cell) => sum + Number(solution[cell]), 0) !== Number(solution[rule.circle])) return
    } else if (rule.type === 'difference') {
      const [a, b] = rule.cells
      if (Math.abs(Number(solution[a]) - Number(solution[b])) !== rule.difference) return
    } else if (rule.type === 'thermometer' && rule.cells.some((cell, index) => index > 0 && solution[cell] <= solution[rule.cells[index - 1]])) return
  }
  if (sizedKillerState(rules, solution, grid.size)?.conflicts.size) return
  if (rules.some(rule => rule.type === 'kropki' || rule.type === 'labeled-dots')) {
    const { size } = grid
    for (let cell = 0; cell < size ** 2; cell++) {
      const digit = Number(solution[cell])
      const neighbors = [cell + 1, cell + size]
      if (neighbors.some(other => other < size ** 2 &&
        kropkiDigitExclusions(rules, cell, other, digit, size) & 1 << (Number(solution[other]) - 1))) return
    }
  }
  return { rules, solution, ...(isSizedRuleAuthor(author) && { author }) }
}

export function sizedRuleDescriptions(grid: SizedGrid, rules: SizedRuleGame['rules']) {
  const group = 'regions' in grid ? 'region' : 'box'
  const clues = new Set<string>()
  for (const rule of rules) {
    if (rule.type === 'diagonal') clues.add(`Place each digit from 1 to ${grid.size} once on the ${rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'} diagonal.`)
    else if (rule.type === 'extra-house') clues.add(`Place each digit from 1 to ${grid.size} once in each marked extra region.`)
    else if (rule.type === 'killer-cages') clues.add('Digits in a cage add to its printed total and cannot repeat.')
    else if (rule.type === 'parity') clues.add(rule.parity === 'odd' ? 'A circle marks an odd digit.' : 'A square marks an even digit.')
    else if (rule.type === 'renban') clues.add('The cells on each Renban line contain different consecutive digits in any order.')
    else if (rule.type === 'region-sum') clues.add(rule.groupByRegion
      ? `The digits on a Region Sum line have the same total in each ${group}. All cells in the same ${group} count together.`
      : `${group === 'region' ? 'Region' : 'Box'} borders split a Region Sum line into segments with the same total. If the line returns to a ${group}, that visit is a separate segment.`)
    else if (rule.type === 'arrow') clues.add('The digits along each arrow add up to the digit in its bulb. The same digit can appear more than once along an arrow if the other rules allow it.')
    else if (rule.type === 'difference') clues.add('The number on each Difference marker gives the exact difference between its two digits.')
    else if (rule.type === 'labeled-dots') {
      if (rule.marks.length) clues.add(rule.relation === 'ratio'
        ? 'The number on a black dot gives the ratio between its two digits.'
        : 'The number on a white dot gives the exact difference between its two digits.')
      if (rule.negative) clues.add(rule.relation === 'ratio'
        ? 'An edge without a labeled black dot cannot have one digit double the other.'
        : 'An edge without a labeled white dot cannot separate consecutive digits.')
    }
    else if (rule.type === 'thermometer') clues.add('Digits strictly increase from the bulb to the tip of each thermometer.')
    else {
      if (rule.consecutive?.pairs?.length) clues.add('Digits separated by a white dot are consecutive.')
      if (rule.ratioTwo?.pairs?.length) clues.add('Across a black dot, one digit is double the other.')
      if (rule.consecutive?.negative) clues.add('An unmarked edge cannot separate consecutive digits.')
      if (rule.ratioTwo?.negative) clues.add('An unmarked edge cannot have one digit double the other.')
    }
  }
  const houses = 'noRegions' in grid ? 'row and column'
    : `row, column, and ${'regions' in grid ? 'region' : `${grid.boxRows} × ${grid.boxColumns} box`}`
  return [`Place each digit from 1 to ${grid.size} once in every ${houses}.`, ...clues]
}
