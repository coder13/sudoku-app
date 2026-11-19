import { createFileRoute } from '@tanstack/react-router'
import { KakuroDifficultyPage } from '../components/Kakuro'

export const Route = createFileRoute('/puzzles/kakuro')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Kakuro difficulty' }] }),
  component: KakuroDifficultyPage,
})
