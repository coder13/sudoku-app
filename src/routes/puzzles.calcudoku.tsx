import { createFileRoute } from '@tanstack/react-router'
import { CalcudokuDifficultyPage } from '../components/Calcudoku'

export const Route = createFileRoute('/puzzles/calcudoku')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Calcudoku difficulty' }] }),
  component: CalcudokuDifficultyPage,
})
