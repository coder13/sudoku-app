import type { NumberPosition } from '../number-puzzles/progress'
import { NumberPuzzleGrid } from './NumberPuzzleGrid'
import type { NumberBoard, NumberGame } from './NumberPuzzleTypes'

/** Read-only puzzle summary backed by the same cell renderer as number-game play. */
export function NumberPuzzlePreview({ board, game, label, position }: {
  board: NumberBoard; game: NumberGame; label: string; position?: NumberPosition
}) {
  return <div className="number-puzzle-import-preview">
    <NumberPuzzleGrid content={{ board, game, name: label }} ariaLabel={label}
      appearance={{ values: position?.values ?? board.cells.map(() => 0), notes: position?.notes }} />
  </div>
}
