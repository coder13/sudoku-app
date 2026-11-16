import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { LearnBreadcrumbs } from '../components/LearnBreadcrumbs'
import { lessonDifficultyLabels } from '../sudoku/lesson-difficulties'
import { learnFundamentals, learnOverview, lessonGroups } from '../sudoku/lessons'

export const Route = createFileRoute('/learn/')({
  head: () => ({ meta: [{ title: learnOverview.pageTitle }] }),
  component: LessonOverview,
})

export function LessonOverview() {
  return (
    <article className="lesson-overview">
      <header className="lesson-heading">
        <LearnBreadcrumbs />
        <p>{learnOverview.intro}</p>
        <p className="lesson-overview-basics">
          <span>{learnOverview.fundamentalsNote}</span>{' '}
          <Link to="/learn/$technique" params={{ technique: learnFundamentals.id }}>{learnFundamentals.title}</Link>.
        </p>
      </header>
      <section className="lesson-overview-section">
        <h2 className="article-subheading">{learnOverview.difficultyTitle}</h2>
        {learnOverview.difficultyParagraphs.map((paragraph, index) => <p className="article-paragraph" key={index}>{paragraph}</p>)}
      </section>
      {lessonGroups.map(({ title, overview, lessons }) => <section className="lesson-overview-section" key={title}>
        <h2 className="article-subheading">{title}</h2>
        <p className="article-paragraph">{overview}</p>
        <ul className="lesson-overview-links" role="list">{lessons.map((lesson) => <li key={lesson.id}>
          <Link to="/learn/$technique" params={{ technique: lesson.id }} className="lesson-overview-link">
            <span>{lesson.title}</span>
            <span className="lesson-overview-difficulty">{lessonDifficultyLabels.get(lesson.id)}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </li>)}</ul>
      </section>)}
    </article>
  )
}
