import { createFileRoute, redirect } from '@tanstack/react-router'
import { CalcudokuPlay } from '../components/Calcudoku'
import { calcudokuCatalog } from '../calcudoku/catalog'

export const Route = createFileRoute('/puzzles/calcudoku_/$puzzle')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Play Calcudoku' }] }),
  loader: ({ params }) => {
    const entry = calcudokuCatalog.find(candidate => candidate.id === params.puzzle)
    if (!entry) throw redirect({ to: '/puzzles/calcudoku', replace: true })
    return entry.id
  },
  component: CalcudokuPlayRoute,
})

function CalcudokuPlayRoute() {
  const entryId = Route.useLoaderData()
  const entry = calcudokuCatalog.find(candidate => candidate.id === entryId)!
  return <CalcudokuPlay key={entry.id} entry={entry} />
}
