import { createFileRoute, redirect } from '@tanstack/react-router'
import { RulloPlay } from '../components/Rullo'
import { rulloCatalog } from '../rullo/catalog'

export const Route = createFileRoute('/puzzles/rullo_/$puzzle')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Rullo' }] }),
  loader: ({ params }) => {
    const entry = rulloCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/rullo', replace: true })
    return entry.id
  },
  component: RulloPlayRoute,
})

function RulloPlayRoute() {
  const entryId = Route.useLoaderData()
  const entry = rulloCatalog.find(candidate => candidate.id === entryId)!
  return <RulloPlay key={entry.id} entry={entry} />
}
