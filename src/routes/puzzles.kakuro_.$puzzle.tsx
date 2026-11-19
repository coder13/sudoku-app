import { createFileRoute, redirect } from '@tanstack/react-router'
import { KakuroPlay } from '../components/Kakuro'
import { kakuroCatalog } from '../kakuro/catalog'

export const Route = createFileRoute('/puzzles/kakuro_/$puzzle')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Kakuro' }] }),
  loader: ({ params }) => {
    const entry = kakuroCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/kakuro', replace: true })
    return entry.id
  },
  component: KakuroPlayRoute,
})

function KakuroPlayRoute() {
  const entryId = Route.useLoaderData()
  const entry = kakuroCatalog.find(candidate => candidate.id === entryId)!
  return <KakuroPlay key={entry.id} entry={entry} />
}
