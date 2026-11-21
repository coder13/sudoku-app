import { createFileRoute, redirect } from '@tanstack/react-router'
import { HidatoPlay } from '../components/Hidato'
import { hidatoCatalog } from '../hidato/catalog'

export const Route = createFileRoute('/puzzles/hidato_/$puzzle')({
  codeSplitGroupings: [['loader', 'component']],
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Hidato' }] }),
  loader: ({ params }) => {
    const entry = hidatoCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/hidato', replace: true })
    return entry.id
  },
  component: HidatoPlayRoute,
})

function HidatoPlayRoute() {
  const entryId = Route.useLoaderData()
  const entry = hidatoCatalog.find(candidate => candidate.id === entryId)!
  return <HidatoPlay key={entry.id} entry={entry} />
}
