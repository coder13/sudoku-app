import { createFileRoute } from '@tanstack/react-router'
import { PracticePage } from '../components/PracticePage'
import { isPracticeTopic, type PracticeTopic } from '../sudoku/practice'

export const Route = createFileRoute('/learn/practice')({
  validateSearch: (search: Record<string, unknown>): { technique?: PracticeTopic } =>
    isPracticeTopic(search.technique) ? { technique: search.technique } : {},
  head: () => ({ meta: [{ title: 'Practice Sudoku techniques' }] }),
  component: PracticeRoute,
})

function PracticeRoute() {
  const { technique } = Route.useSearch()
  return <PracticePage key={technique ?? 'practice'} initialTopic={technique} />
}
