import { runEngine, type EngineRunner } from './engine.ts'
import { isAlgebraicCageList, type AlgebraicCage } from './algebraic-cages.ts'
import { conflictsOf } from './game.ts'
import { isGridText, MINI_GRID, sizedClassicPosition } from './grid.ts'
import { validation } from './puzzle-validation.ts'
import { decodeSizedSudokuPad, type SizedSudokuPadImport } from './sized-sudoku-pad.ts'

export type AlgebraicDefinition = { rules: readonly AlgebraicCage[] } & Partial<Pick<SizedSudokuPadImport, 'source'>>
export type AlgebraicGame = AlgebraicDefinition & { solution: string }

export function algebraicPosition({ rules }: Pick<AlgebraicGame, 'rules'>, values: string) {
  return { ...sizedClassicPosition(MINI_GRID, values), rules }
}

export function rateAlgebraicPuzzle(givens: string, rules: AlgebraicDefinition['rules'], run: EngineRunner = runEngine) {
  return run({ type: 'sized-variant', operation: 'rate', position: algebraicPosition({ rules }, givens) })
}

export async function verifyAlgebraicPuzzle({ givens, rules, source }: AlgebraicDefinition & { givens: string }, run: EngineRunner = runEngine): Promise<AlgebraicGame> {
  const position = algebraicPosition({ rules }, givens)
  const result = await run({ type: 'sized-variant', operation: 'solve-unique', position })
  if (result.status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
  if (result.status !== 'unique') throw new Error(validation[result.status].text)
  const solution = result.solution.digits.join('')
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
