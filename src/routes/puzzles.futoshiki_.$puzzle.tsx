import { createFileRoute, redirect } from '@tanstack/react-router'
import { FutoshikiPlay } from '../components/Futoshiki'
import { futoshikiCatalog } from '../futoshiki/catalog'

export const Route = createFileRoute('/puzzles/futoshiki_/$puzzle')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Futoshiki' }] }),
  loader: ({ params }) => {
    const entry = futoshikiCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/futoshiki', replace: true })
    return entry.id
  },
  component: FutoshikiPlayRoute,
})

function FutoshikiPlayRoute() {
  const entryId = Route.useLoaderData()
  const entry = futoshikiCatalog.find(candidate => candidate.id === entryId)!
  return <FutoshikiPlay key={entry.id} entry={entry} />
}
