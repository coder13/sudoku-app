import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { LearnHeading } from '../components/LearnHeading'
import { lessonDifficultyLabels, lessonsByVariant } from '../sudoku/lesson-difficulties'
import { learnFundamentals, learnOverview } from '../sudoku/lessons'

export const Route = createFileRoute('/learn/')({
  head: () => ({ meta: [{ title: learnOverview.pageTitle }] }),
  component: LessonOverview,
})

export function LessonOverview() {
  return (
    <article className="lesson-overview">
      <LearnHeading summary={learnOverview.intro}>
        <p className="lesson-overview-basics">
          <span>{learnOverview.fundamentalsNote}</span>{' '}
          <Link to="/learn/$technique" params={{ technique: learnFundamentals.id }}>{learnFundamentals.title}</Link>.
        </p>
      </LearnHeading>
      <section className="lesson-overview-section" data-lesson-difficulty>
        <h2 className="article-subheading">{learnOverview.difficultyTitle}</h2>
        {learnOverview.difficultyParagraphs.map((paragraph, index) => <p className="article-paragraph" key={index}>{paragraph}</p>)}
      </section>
      {lessonsByVariant.map(({ title, group, difficulties }) => <section className="lesson-overview-section" key={title}>
        <h2 className="article-subheading" data-lesson-group-title={group?.index}>{title}</h2>
        {group && <p className="article-paragraph" data-lesson-group-overview={group.index}>{group.overview}</p>}
        {difficulties.map(({ title, families }) => {
          const links = families.map(family => <div className="lesson-overview-family" key={family.index}>
            {!group && families.length > 1 &&
              <h4 data-lesson-group-title={family.index}>{family.title}</h4>}
            <ul className="lesson-overview-links" role="list">{family.lessons.map(lesson => <li key={lesson.id}>
              <Link to="/learn/$technique" params={{ technique: lesson.id }} className="lesson-overview-link">
                <span>{lesson.title}</span>
                <span className="lesson-overview-difficulty">{lessonDifficultyLabels.get(lesson.id)}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </li>)}</ul>
          </div>)
          return <details className="lesson-overview-level" key={title}><summary>{title}</summary>{links}</details>
        })}
      </section>)}
    </article>
  )
}
