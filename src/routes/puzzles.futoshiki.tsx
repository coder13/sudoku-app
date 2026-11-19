import { createFileRoute } from '@tanstack/react-router'
import { FutoshikiDifficultyPage } from '../components/Futoshiki'

export const Route = createFileRoute('/puzzles/futoshiki')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Futoshiki difficulty' }] }),
  component: FutoshikiDifficultyPage,
})
