import { runEngine } from './engine.ts'
import { conflictsOf } from './game.ts'
import { isGridText, MINI_GRID, sizedClassicPosition } from './grid.ts'
import { validation } from './puzzle-validation.ts'
import { decodeSizedSudokuPad, type SizedSudokuPadImport } from './sized-sudoku-pad.ts'

type Definition = Pick<SizedSudokuPadImport, 'rules' | 'source'>
export type AlgebraicGame = Definition & { solution: string }

export function algebraicPosition({ rules }: Pick<AlgebraicGame, 'rules'>, values: string) {
  return { ...sizedClassicPosition(MINI_GRID, values), rules }
}

export async function verifyAlgebraicImport({ givens, rules, source }: SizedSudokuPadImport): Promise<AlgebraicGame> {
  const position = algebraicPosition({ rules }, givens)
  const status = await runEngine({ type: 'sized-variant', operation: 'analyze', position })
  if (status === 'conflict') throw new Error('This puzzle has conflicting givens or rules.')
  if (status !== 'unique') throw new Error(validation[status].text)
  const answer = await runEngine({ type: 'sized-variant', operation: 'solve', position })
  if (!answer) throw new Error('The engine could not verify this puzzle’s solution.')
  const solution = answer.digits.join('')
  if (source.solution && source.solution !== solution) throw new Error('The authored solution conflicts with the puzzle’s rules.')
  return { rules, source, solution }
}

/** Reconstruct the authoritative rules and labels when opening a persisted or synced game. */
export function restoreAlgebraicGame({ source, solution }: AlgebraicGame, givens: string): AlgebraicGame | undefined {
  if (typeof source?.code !== 'string' || !isGridText(solution, MINI_GRID) || solution.includes('0')) return
  const decoded = decodeSizedSudokuPad(source.code)
  if (decoded.givens !== givens || (decoded.source.solution && decoded.source.solution !== solution) ||
    [...givens].some((digit, cell) => digit !== '0' && digit !== solution[cell])) return
  if (conflictsOf(solution, undefined, MINI_GRID).size) return
  const variables = new Map<string, number>()
  for (const { cells, total } of decoded.rules) {
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
  return { rules: decoded.rules, source: decoded.source, solution }
}
