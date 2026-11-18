import { createFileRoute } from '@tanstack/react-router'
import { FindDifficulty } from '../components/FindDifficulty'
import { isPracticeTopic, type PracticeTopic } from '../sudoku/practice'

export const Route = createFileRoute('/find-difficulty')({
  validateSearch: (search): { technique?: PracticeTopic } =>
    isPracticeTopic(search.technique) ? { technique: search.technique } : {},
  head: () => ({ meta: [{ title: 'Find my Sudoku difficulty' }] }),
  component: DifficultyRoute,
})

function DifficultyRoute() {
  const { technique } = Route.useSearch()
  return <FindDifficulty key={technique ?? 'check'} focus={technique} />
}
