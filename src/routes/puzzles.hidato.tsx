import { createFileRoute } from '@tanstack/react-router'
import { HidatoDifficultyPage } from '../components/Hidato'

export const Route = createFileRoute('/puzzles/hidato')({
  staticData: { standalonePuzzlePage: true },
  head: () => ({ meta: [{ title: 'Hidato difficulty' }] }),
  component: HidatoDifficultyPage,
})
