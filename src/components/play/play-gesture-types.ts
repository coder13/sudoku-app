import type { Game } from '../../sudoku/game'
import type { CandidatePaintMode } from './useCandidatePaintDrag'

export type CandidatePress = {
  pointerId: number
  cell: number
  mask: number
  mode: CandidatePaintMode
  cancelled: boolean
}

export type PendingDoubleClickSingle = { index: number; digit: number; game: Game }
