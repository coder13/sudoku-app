import { gridDiagonalCells } from '../sudoku/grid.ts'
import { distinctCellSupport, type LatinRule } from './engine.ts'

export type LatinDiagonal = 'main' | 'anti'
export const latinDiagonalTechnique = 'Diagonal'
export const latinDiagonalNames = {
  main: 'top-left to bottom-right diagonal',
  anti: 'top-right to bottom-left diagonal',
} satisfies Record<LatinDiagonal, string>

export function latinDiagonalRules(size: number, diagonals: readonly LatinDiagonal[] = []): LatinRule[] {
  const all = (1 << size) - 1
  return diagonals.map(diagonal => {
    const cells = gridDiagonalCells(size, diagonal)
    return {
      kind: 'diagonal', cells,
      label: `Each digit must appear once on the ${latinDiagonalNames[diagonal]}.`,
      support: domains => distinctCellSupport(cells, domains, all),
    }
  })
}

export function encodeLatinDiagonals(diagonals: readonly LatinDiagonal[] = []) {
  const mask = Number(diagonals.includes('main')) + 2 * Number(diagonals.includes('anti'))
  return mask ? `.g${mask}` : ''
}

export function readLatinDiagonals(token: string | undefined): LatinDiagonal[] | undefined {
  if (token === '1') return ['main']
  if (token === '2') return ['anti']
  if (token === '3') return ['main', 'anti']
}
