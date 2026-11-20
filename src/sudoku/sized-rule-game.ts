import { runEngine, type SizedConstraintPosition, type SizedConstraintRule } from './engine.ts'
import { conflictsOf } from './game.ts'
import { isGridText, gridDiagonalCells, sizedClassicPosition, type SizedGrid } from './grid.ts'
import { validation } from './puzzle-validation.ts'

export type SizedRuleDefinition = { grid: SizedGrid; givens: string; rules: readonly SizedConstraintRule[]; author?: string; authoredSolution?: string }
export type SizedRuleGame = Pick<SizedRuleDefinition, 'rules' | 'author'> & { solution: string }

export function isSizedRuleAuthor(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 72
}

export function isSizedRuleList(value: unknown, size: number): value is SizedRuleDefinition['rules'] {
  if (!Array.isArray(value) || value.length > 128) return false
  return value.every(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false
    if (rule.type === 'diagonal') {
      return Object.keys(rule).length === 2 && (rule.diagonal === 'main' || rule.diagonal === 'anti')
    }
    const cells: unknown = rule.cells
    if (!Array.isArray(cells) || cells.length > size ** 2 ||
      !cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size ** 2)) return false
    if (rule.type === 'parity') {
      return Object.keys(rule).length === 3 && cells.length > 0 && (rule.parity === 'even' || rule.parity === 'odd')
    }
    if (!cells.length || cells.length > size || new Set(cells).size !== cells.length) return false
    if (rule.type === 'thermometer') return Object.keys(rule).length === 2 && cells.length >= 2
    if (rule.type !== 'renban' || Object.keys(rule).some(key => !['type', 'cells', 'segments'].includes(key))) return false
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
  if (!isSizedRuleList(rules, grid.size)) throw new Error('This grid has invalid or unsupported rules.')
  const position = sizedRulePosition(grid, { rules }, givens)
  const status = await runEngine({ type: 'sized-variant', operation: 'analyze', position })
  if (status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
  if (status !== 'unique') throw new Error(validation[status].text)
  const answer = await runEngine({ type: 'sized-variant', operation: 'solve', position })
  if (!answer) throw new Error('The engine could not verify this puzzle’s solution.')
  const solution = answer.digits.join('')
  if (authoredSolution !== undefined && solution !== authoredSolution) {
    throw new Error('The authored solution conflicts with the puzzle’s rules.')
  }
  return { rules, solution, ...(isSizedRuleAuthor(author) && { author }) }
}

export function restoreSizedRuleGame({ rules, solution, author }: SizedRuleGame, grid: SizedGrid, givens: string): SizedRuleGame | undefined {
  if (!isSizedRuleList(rules, grid.size) || (grid.size === 4 && !rules.length) || !isGridText(solution, grid) || solution.includes('0') ||
    Array.from(givens).some((digit, cell) => digit !== '0' && digit !== solution[cell]) ||
    conflictsOf(solution, undefined, grid).size) return
  for (const rule of rules) {
    if (rule.type === 'diagonal') {
      if (new Set(gridDiagonalCells(grid.size, rule.diagonal).map(cell => solution[cell])).size !== grid.size) return
    } else if (rule.type === 'parity') {
      if (rule.cells.some(cell => Number(solution[cell]) % 2 !== (rule.parity === 'odd' ? 1 : 0))) return
    } else if (rule.type === 'renban') {
      const digits = rule.cells.map(cell => Number(solution[cell]))
      if (new Set(digits).size !== digits.length || Math.max(...digits) - Math.min(...digits) !== digits.length - 1) return
    } else if (rule.cells.some((cell, index) => index > 0 && solution[cell] <= solution[rule.cells[index - 1]])) return
  }
  return { rules, solution, ...(isSizedRuleAuthor(author) && { author }) }
}

export function sizedRuleDescriptions(grid: SizedGrid, rules: SizedRuleGame['rules']) {
  const clues = new Set<string>()
  for (const rule of rules) {
    if (rule.type === 'diagonal') clues.add(`Place each digit from 1 to ${grid.size} once on the ${rule.diagonal === 'main' ? 'top-left to bottom-right' : 'top-right to bottom-left'} diagonal.`)
    else if (rule.type === 'parity') clues.add(rule.parity === 'odd' ? 'A circle marks an odd digit.' : 'A square marks an even digit.')
    else if (rule.type === 'renban') clues.add('The cells on each Renban line contain different consecutive digits in any order.')
    else clues.add('Digits strictly increase from the bulb to the tip of each thermometer.')
  }
  return [`Place each digit from 1 to ${grid.size} once in every row, column, and ${grid.boxRows} × ${grid.boxColumns} box.`, ...clues]
}
