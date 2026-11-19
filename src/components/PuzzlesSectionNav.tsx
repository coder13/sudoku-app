import { Link } from '@tanstack/react-router'
import { BarChart3, BookOpen, Dices, Grid3X3, Trophy } from 'lucide-react'

export const puzzleSections = {
  puzzles: { to: '/puzzles/browse', label: 'Active Puzzles', icon: Grid3X3 },
  new: { to: '/puzzles/new', label: 'New puzzle', icon: Dices },
  solved: { to: '/puzzles/solved', label: 'Solved puzzles', icon: Trophy },
  collections: { to: '/puzzles/collections', label: 'Collections', icon: BookOpen },
  statistics: { to: '/puzzles/statistics', label: 'Statistics', icon: BarChart3 },
} as const
export type PuzzleSection = keyof typeof puzzleSections

/** Use for navigation between sections of the Puzzles screen. */
export function PuzzlesSectionNav({ active }: { active: PuzzleSection }) {
  return <nav className="main-menu-tabs" aria-label="Puzzles sections">
    {Object.entries(puzzleSections).map(([id, { to, label, icon: Icon }]) => (
      <Link key={id} to={to} search={{}} data-section={id} aria-current={active === id ? 'page' : undefined}
        activeOptions={{ exact: id !== 'new', includeSearch: false }}><Icon size={18} aria-hidden="true" />{label}</Link>
    ))}
  </nav>
}
