import { useEffect, useMemo } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { CalcudokuPlay } from '../components/Calcudoku'
import { calcudokuCatalog, generatedCalcudokuEntry } from '../calcudoku/catalog'
import { generatedNumberToken } from '../number-puzzles/generated'
import { generatedNumberTokens, rememberGeneratedNumberPuzzle } from '../number-puzzles/progress'

export const Route = createFileRoute('/puzzles/calcudoku_/$puzzle')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Calcudoku' }] }),
  validateSearch: (search): { board?: string } => ({ board: generatedNumberToken(search.board) }),
  loader: ({ params }) => {
    if (params.puzzle === 'generated') return 'generated'
    const entry = calcudokuCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/calcudoku', replace: true })
    return entry.id
  },
  component: CalcudokuPlayRoute,
})

function CalcudokuPlayRoute() {
  const entryId = Route.useLoaderData()
  const { board } = Route.useSearch()
  const entry = useMemo(() => entryId === 'generated'
    ? board && generatedCalcudokuEntry(board, Math.max(1, generatedNumberTokens('calcudoku').indexOf(board) + 1))
    : calcudokuCatalog.find(candidate => candidate.id === entryId), [board, entryId])
  useEffect(() => {
    if (entry && entry.generated) rememberGeneratedNumberPuzzle('calcudoku', entry.id)
  }, [entry])
  if (!entry) return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout">
      <h1>Calcudoku puzzle unavailable</h1>
      <Link to="/puzzles/calcudoku">Choose a Calcudoku puzzle</Link>
    </div>
  </main>
  return <CalcudokuPlay key={entry.id} entry={entry} />
}
