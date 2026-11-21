import { useEffect, useMemo } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { FutoshikiPlay } from '../components/Futoshiki'
import { futoshikiCatalog } from '../futoshiki/catalog'
import { importedFutoshikiToken, readImportedFutoshiki, verifiedImportedFutoshiki } from '../futoshiki/imported'
import { saveFutoshikiImport } from '../futoshiki/imported-storage'

export const Route = createFileRoute('/puzzles/futoshiki_/$puzzle')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Futoshiki' }] }),
  validateSearch: (search): { board?: string } => ({ board: importedFutoshikiToken(search.board) }),
  // Imported links share one offline shell. Read their board from the URL on the client.
  ssr: ({ params }) => params.status === 'success' && params.value.puzzle === 'imported' ? 'data-only' : true,
  loader: ({ params }) => {
    if (params.puzzle === 'imported') return params.puzzle
    const entry = futoshikiCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/futoshiki', replace: true })
    return entry.id
  },
  component: FutoshikiPlayRoute,
})

function FutoshikiPlayRoute() {
  const entryId = Route.useLoaderData()
  const { board } = Route.useSearch()
  const entry = useMemo(() => {
    if (entryId !== 'imported') return futoshikiCatalog.find(candidate => candidate.id === entryId)
    const imported = board && readImportedFutoshiki(board)
    if (imported) {
      try { return verifiedImportedFutoshiki(imported) } catch { /* Show the unavailable screen for invalid links. */ }
    }
  }, [board, entryId])
  useEffect(() => {
    if (entry?.imported) saveFutoshikiImport(entry)
  }, [entry])
  if (!entry) return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout">
      <h1>Futoshiki puzzle unavailable</h1>
      <Link to="/puzzles/futoshiki">Choose a Futoshiki puzzle</Link>
    </div>
  </main>
  return <FutoshikiPlay key={entry.id} entry={entry} />
}
