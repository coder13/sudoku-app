import { numberPositionKey } from '../number-puzzles/generated-storage'
import { loadNumberProgress } from '../number-puzzles/progress'
import type { NumberGame, NumberBoard } from './NumberPuzzleTypes'
import type { NumberPuzzleEntry } from '../number-puzzles/catalog'

export function puzzleDestination(game: NumberGame, entry: NumberPuzzleEntry) {
  return {
    to: `/puzzles/${game}/$puzzle` as const,
    params: { puzzle: entry.generated ? 'generated' : entry.id },
    search: entry.generated ? { board: entry.id } : undefined,
  }
}

export function boardPosition(game: NumberGame, id: string, board: NumberBoard) {
  const key = numberPositionKey(game, id)
  const editable = editableCells(board)
  return { editable, key, load: () => loadNumberProgress(key, editable, board.maxValue) }
}

export function editableCells(board: NumberBoard) {
  return board.cells.map(cell => !cell.block && !cell.given)
}
