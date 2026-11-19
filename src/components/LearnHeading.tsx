import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { learnOverview } from '../sudoku/lessons'

const activeOptions = { exact: true }

export function LessonDifficulty({ label }: { label: string }) {
  return <span className="lesson-chip lesson-difficulty-chip"><span className="sr-only">Difficulty </span>{label}</span>
}

export function LearnHeading({ title, summary, difficulty, children }: {
  title?: string; summary?: string; difficulty?: string; children?: ReactNode
}) {
  return <header className="lesson-heading">
    <nav className="learn-breadcrumbs" aria-label="Breadcrumb">
      <ol role="list">
        <li><Link to="/puzzles/browse" activeOptions={activeOptions}>Sudoku</Link></li>
        {title !== undefined && <li>
          <ChevronRight size={12} aria-hidden="true" />
          <Link to="/learn" activeOptions={activeOptions}>{learnOverview.title}</Link>
        </li>}
        <li className="sr-only" aria-current="page">{title ?? learnOverview.title}</li>
      </ol>
    </nav>
    <div className="lesson-title-row">
      <h1 className="lesson-title">{title ?? learnOverview.title}</h1>
      {difficulty && <LessonDifficulty label={difficulty} />}
    </div>
    {summary !== undefined && <p className="lesson-summary">{summary}</p>}
    {children}
  </header>
}
