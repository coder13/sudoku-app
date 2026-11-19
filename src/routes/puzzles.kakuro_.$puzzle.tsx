import { useEffect, useMemo } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { KakuroPlay } from '../components/Kakuro'
import { kakuroCatalog, generatedKakuroEntry } from '../kakuro/catalog'
import { generatedNumberToken } from '../number-puzzles/generated'
import { generatedNumberTokens, rememberGeneratedNumberPuzzle } from '../number-puzzles/progress'

export const Route = createFileRoute('/puzzles/kakuro_/$puzzle')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Kakuro' }] }),
  // Generated links share one offline shell, so render their search data on the client.
  ssr: ({ params }) => params.status === 'success' && params.value.puzzle === 'generated' ? 'data-only' : true,
  validateSearch: (search): { board?: string } => ({ board: generatedNumberToken(search.board) }),
  loader: ({ params }) => {
    if (params.puzzle === 'generated') return 'generated'
    const entry = kakuroCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/kakuro', replace: true })
    return entry.id
  },
  component: KakuroPlayRoute,
})

function KakuroPlayRoute() {
  const entryId = Route.useLoaderData()
  const { board } = Route.useSearch()
  const entry = useMemo(() => entryId === 'generated'
    ? board && generatedKakuroEntry(board, Math.max(1, generatedNumberTokens('kakuro').indexOf(board) + 1))
    : kakuroCatalog.find(candidate => candidate.id === entryId), [board, entryId])
  useEffect(() => {
    if (entry && entry.generated) rememberGeneratedNumberPuzzle('kakuro', entry.id)
  }, [entry])
  if (!entry) return <main className="puzzles-page puzzles-subscreen puzzle-game-page">
    <div className="puzzles-layout">
      <h1>Kakuro puzzle unavailable</h1>
      <Link to="/puzzles/kakuro">Choose a Kakuro puzzle</Link>
    </div>
  </main>
  return <KakuroPlay key={entry.id} entry={entry} />
}
