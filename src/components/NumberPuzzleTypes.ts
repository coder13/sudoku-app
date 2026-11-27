import type { ReactNode } from 'react'
import type { NumberPuzzleDifficulty, NumberPuzzleEntry } from '../number-puzzles/catalog'
import type { GeneratedNumberGame } from '../number-puzzles/generated'

export type NumberGame = GeneratedNumberGame | 'futoshiki' | 'hidato' | 'rullo'

export type NumberBoardCell = {
  label?: string
  authoredColors?: readonly string[]
  given?: number
  printed?: number
  decoration?: ReactNode
  edges?: string
  block?: boolean
  endpoint?: boolean
  kropki?: boolean
}

export type NumberPuzzleHint = { cell: number; value: number; marked: number[]; technique: string } & (
  | { reasons: string[]; renderExplanation?: never }
  | { renderExplanation: (cellName: (index: number) => string) => ReactNode; reasons?: never }
)

export type NumberBoard = {
  width: number
  height: number
  maxValue: number
  cells: readonly NumberBoardCell[]
  cellChoices?: { labels: readonly string[]; off: number }
  mirrorEdgeClues?: boolean
  ruleDescription?: string
  check: (values: readonly number[], mode?: 'solution') => { complete: boolean; marked: number[] }
  hints: (values: readonly number[], limit?: number) => readonly NumberPuzzleHint[]
  solve: () => readonly number[] | null
}

export type NumberGameConfig<Entry extends NumberPuzzleEntry> = {
  name: string
  rules: string
  entries: readonly Entry[]
  techniques: readonly string[]
  board: (entry: Entry) => NumberBoard
  hasClueCells?: boolean
} & (
  | { game: GeneratedNumberGame; generatedEntry?: (id: string, number: number) => Entry | null }
  | { game: Exclude<NumberGame, GeneratedNumberGame>; generatedEntry?: never }
)
