import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { learnOverview } from '../sudoku/lessons'

const activeOptions = { exact: true }

export function LearnBreadcrumbs({ current }: { current?: string }) {
  return (
    <nav className="learn-breadcrumbs" aria-label="Breadcrumb">
      <ol role="list">
        <li><Link to="/" activeOptions={activeOptions}>Sudoku</Link></li>
        {current !== undefined && <li>
          <ChevronRight size={14} aria-hidden="true" />
          <Link to="/learn" activeOptions={activeOptions}>{learnOverview.title}</Link>
        </li>}
        <li>
          <ChevronRight size={14} aria-hidden="true" />
          <h1 aria-current="page">{current ?? learnOverview.title}</h1>
        </li>
      </ol>
    </nav>
  )
}
