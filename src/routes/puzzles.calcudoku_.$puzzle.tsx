import { useEffect, useMemo } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { CalcudokuPlay } from '../components/Calcudoku'
import { calcudokuCatalog, generatedCalcudokuEntry } from '../calcudoku/catalog'
import { readImportedCalcudoku, verifyImportedCalcudoku } from '../calcudoku/imported'
import { importedCalcudokuToken } from '../calcudoku/import-token'
import { saveCalcudokuImport } from '../calcudoku/imported-storage'
import { generatedNumberToken } from '../number-puzzles/generated-token'

export const Route = createFileRoute('/puzzles/calcudoku_/$puzzle')({
  codeSplitGroupings: [['loader', 'component']],
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Calcudoku' }] }),
  validateSearch: (search): { board?: string } => ({ board: generatedNumberToken(search.board) ?? importedCalcudokuToken(search.board) }),
  // Portable puzzle links use offline shells and read their board from the URL on the client.
  ssr: ({ params }) => params.status === 'success' && ['generated', 'imported'].includes(params.value.puzzle) ? 'data-only' : true,
  loader: ({ params }) => {
    if (params.puzzle === 'generated' || params.puzzle === 'imported') return params.puzzle
    const entry = calcudokuCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/calcudoku', replace: true })
    return entry.id
  },
  component: CalcudokuPlayRoute,
})

function CalcudokuPlayRoute() {
  const entryId = Route.useLoaderData()
  const { board } = Route.useSearch()
  const entry = useMemo(() => {
    if (entryId === 'generated') return board ? generatedCalcudokuEntry(board, 1) : undefined
    if (entryId !== 'imported') return calcudokuCatalog.find(candidate => candidate.id === entryId)
    const imported = board && readImportedCalcudoku(board)
    if (imported) {
      try { return verifyImportedCalcudoku(imported) } catch { /* Show the unavailable screen for invalid links. */ }
    }
  }, [board, entryId])
  useEffect(() => {
    if (entry?.imported) saveCalcudokuImport(entry)
  }, [entry])
  if (!entry) return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout">
      <h1>Calcudoku puzzle unavailable</h1>
      <Link to="/puzzles/calcudoku">Choose a Calcudoku puzzle</Link>
    </div>
  </main>
  return <CalcudokuPlay key={entry.id} entry={entry} />
}
