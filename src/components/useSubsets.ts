import { useMemo } from 'react'
import type { VariantPuzzle } from '../sudoku/engine'
import type { PlayGrid } from '../sudoku/grid'
import { compareSubsetCandidates } from '../sudoku/subsets'
import type { BoardAnnotations, CandidateAnnotation } from './BoardAnnotations'

export function useSubsets(masks: readonly number[] | null, selected: readonly number[], values: string, grid: PlayGrid, puzzle?: VariantPuzzle) {
  return useMemo(() => {
    const cells = selected.filter((cell) => values[cell] === '0')
    if (!masks || !cells.length) return { cells, digits: [], annotations: undefined }

    const { digits, matches } = compareSubsetCandidates(cells, masks, grid, puzzle)
    const mark: CandidateAnnotation = {
      color: 'var(--lesson-pattern)',
      label: cells.length === 1 ? 'matches the selected cell' : 'common to the selected cells',
    }
    const annotations: BoardAnnotations = {
      candidates: new Map([...matches].map(([cell, digits]) => [cell, new Map(digits.map((digit) => [digit, mark]))])),
    }
    return { cells, digits, annotations }
  }, [masks, selected, values, grid, puzzle])
}
