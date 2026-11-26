import { createFileRoute } from '@tanstack/react-router'
import { AboutPage } from '../components/AboutPage'

export const Route = createFileRoute('/about')({
  head: () => ({ meta: [
    { title: 'About Sudoku | Difficulty tiers and ratings' },
    { name: 'description', content: 'Explore the ten classic Sudoku difficulty tiers, their techniques, and typical app and SE ratings.' },
  ] }),
  component: AboutPage,
})
