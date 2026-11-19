import { createFileRoute } from '@tanstack/react-router'
import { RulloDifficultyPage } from '../components/Rullo'

export const Route = createFileRoute('/puzzles/rullo')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Rullo difficulty' }] }),
  component: RulloDifficultyPage,
})
