import { useMemo } from 'react'
import type { VariantPuzzle } from '../sudoku/engine'
import type { PlayGrid } from '../sudoku/grid'
import { compareSubsetCandidates, selectedNakedSubset } from '../sudoku/subsets'
import { hasCandidate, marksOf } from '../sudoku/game'
import type { BoardAnnotations, CandidateAnnotation } from './BoardAnnotations'

export function useSubsets(masks: readonly number[] | null, completeMasks: readonly number[] | null,
  selected: readonly number[], values: string, grid: PlayGrid, puzzle?: VariantPuzzle) {
  return useMemo(() => {
    const cells = selected.filter((cell) => values[cell] === '0')
    if (!masks || !cells.length) return { cells, digits: [], removalCount: null, annotations: undefined }

    const naked = completeMasks && selectedNakedSubset(cells, completeMasks, grid, puzzle)
    if (naked) {
      const members: CandidateAnnotation = { color: 'var(--lesson-pattern)', label: 'in the naked subset' }
      const removal: CandidateAnnotation = { color: 'var(--lesson-removal)', mark: 'strike', label: 'can be removed' }
      const candidates = new Map(cells.map(cell => [cell, new Map(marksOf(masks[cell]).map(digit => [digit, members]))]))
      let removalCount = 0
      for (const [cell, digits] of naked.removals) {
        const visible = digits.filter(digit => hasCandidate(masks[cell], digit))
        if (!visible.length) continue
        candidates.set(cell, new Map(visible.map(digit => [digit, removal])))
        removalCount += visible.length
      }
      return { cells, digits: naked.digits, removalCount, annotations: { candidates } }
    }

    const { digits, matches } = compareSubsetCandidates(cells, masks, grid, puzzle)
    const mark: CandidateAnnotation = {
      color: 'var(--lesson-pattern)',
      label: cells.length === 1 ? 'matches the selected cell' : 'common to the selected cells',
    }
    const annotations: BoardAnnotations = {
      candidates: new Map([...matches].map(([cell, digits]) => [cell, new Map(digits.map((digit) => [digit, mark]))])),
    }
    return { cells, digits, removalCount: null, annotations }
  }, [masks, completeMasks, selected, values, grid, puzzle])
}
