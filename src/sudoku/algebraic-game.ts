import { runEngine } from './engine.ts'
import { conflictsOf } from './game.ts'
import { isGridText, MINI_GRID, sizedClassicPosition } from './grid.ts'
import { validation } from './puzzle-validation.ts'
import { decodeSizedSudokuPad, type SizedSudokuPadImport } from './sized-sudoku-pad.ts'

export type AlgebraicDefinition = Pick<SizedSudokuPadImport, 'rules'> & Partial<Pick<SizedSudokuPadImport, 'source'>>
export type AlgebraicGame = AlgebraicDefinition & { solution: string }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Validate native cage definitions before passing them to the engine or board. */
export function isAlgebraicCageList(rules: unknown): rules is AlgebraicDefinition['rules'] {
  const occupied = new Set<number>()
  const names = new Set<string>()
  if (!Array.isArray(rules) || !rules.length || rules.length > 16) return false
  for (const rule of rules) {
    if (!record(rule) || Object.keys(rule).length !== 4 || rule.type !== 'algebraic-cage' ||
      !Array.isArray(rule.cells) || !rule.cells.length || rule.cells.length > 4 || !record(rule.total)) return false
    for (const cell of rule.cells) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= 16 || occupied.has(cell)) return false
      occupied.add(cell)
    }
    const { type, name, offset, value } = rule.total
    if (type === 'fixed') {
      if (Object.keys(rule.total).length !== 2 || typeof value !== 'number' ||
        !Number.isInteger(value) || value < 1 || value > 10 || rule.label !== String(value)) return false
    } else {
      if (type !== 'variable' || Object.keys(rule.total).length !== 3 || typeof name !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name) || typeof offset !== 'number' || !Number.isInteger(offset) ||
        offset < -2147483648 || offset > 2147483647 ||
        rule.label !== name + (offset ? `${offset > 0 ? '+' : ''}${offset}` : '')) return false
      names.add(name)
    }
  }
  return names.size > 0
}

export function algebraicPosition({ rules }: Pick<AlgebraicGame, 'rules'>, values: string) {
  return { ...sizedClassicPosition(MINI_GRID, values), rules }
}

export async function verifyAlgebraicImport({ givens, rules, source }: AlgebraicDefinition & { givens: string }): Promise<AlgebraicGame> {
  const position = algebraicPosition({ rules }, givens)
  const status = await runEngine({ type: 'sized-variant', operation: 'analyze', position })
  if (status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
  if (status !== 'unique') throw new Error(validation[status].text)
  const answer = await runEngine({ type: 'sized-variant', operation: 'solve', position })
  if (!answer) throw new Error('The engine could not verify this puzzle’s solution.')
  const solution = answer.digits.join('')
  if (source?.solution && source.solution !== solution) throw new Error('The authored solution conflicts with the puzzle’s rules.')
  return { rules, ...(source && { source }), solution }
}

/** Reconstruct the authoritative rules and labels when opening a persisted or synced game. */
export function restoreAlgebraicGame({ rules, source, solution }: AlgebraicGame, givens: string): AlgebraicGame | undefined {
  if (!isGridText(solution, MINI_GRID) || solution.includes('0') ||
    [...givens].some((digit, cell) => digit !== '0' && digit !== solution[cell])) return
  if (source !== undefined) {
    if (typeof source?.code !== 'string') return
    const decoded = decodeSizedSudokuPad(source.code)
    if (decoded.givens !== givens || (decoded.source.solution && decoded.source.solution !== solution)) return
    rules = decoded.rules
    source = decoded.source
  } else if (!isAlgebraicCageList(rules)) return
  if (conflictsOf(solution, undefined, MINI_GRID).size) return
  const variables = new Map<string, number>()
  for (const { cells, total } of rules) {
    const digits = cells.map(cell => Number(solution[cell]))
    if (new Set(digits).size !== digits.length) return
    const sum = digits.reduce((value, digit) => value + digit, 0)
    if (total.type === 'fixed') {
      if (total.value !== sum) return
    } else {
      const value = sum - total.offset
      if (value < 1 || (variables.has(total.name) && variables.get(total.name) !== value)) return
      variables.set(total.name, value)
    }
  }
  return { rules, ...(source && { source }), solution }
}
