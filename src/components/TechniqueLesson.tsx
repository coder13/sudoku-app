import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { Fragment, useEffect, useId, useState, type CSSProperties } from 'react'
import type { LessonExample } from '../sudoku/engine'
import examplesJson from '../sudoku/generated/lesson-examples.json?raw'
import { lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { articles, type Drill, type LessonArticle, type LessonBlock } from '../sudoku/lessons'
import { Board } from './Board'
import type { BoardRegion } from './BoardAnnotations'
import { LearnBreadcrumbs } from './LearnBreadcrumbs'
import { PracticePuzzle } from './LessonPractice'
import { SelectControl } from './SelectControl'

const lessonExamples = JSON.parse(examplesJson) as Record<string, LessonExample>

export function Diagram({ example, crop, copy }: {
  example: LessonExample
  crop?: BoardRegion
  copy?: Extract<LessonBlock, { type: 'diagram' }>['copy']
}) {
  const { annotations, region, description, reason, mainLabel, accentLabel, results: defaultResults, trace: defaultTrace } = lessonDiagram(example)
  const view = crop ?? region
  const results = copy?.results ?? defaultResults
  const trace = copy?.trace ?? defaultTrace
  const style = { '--diagram-columns': view.columns } as CSSProperties
  const strong = annotations.links?.some((link) => !link.dashed)
  const weak = annotations.links?.some((link) => link.dashed && !link.arrow)
  return (
    <figure className="lesson-diagram">
      <div className="lesson-board lesson-diagram-board" style={style}>
        <Board givens={example.givens} values={lessonValues(example)} candidates={example.candidates}
          region={view} annotations={annotations} label="Sudoku diagram" showGuides />
      </div>
      <figcaption>
        <p>{copy?.description ?? description}</p>
        <p>{copy?.reason ?? reason}</p>
        {results.length === 1 ? <p className="lesson-outcomes">{results[0]}</p>
          : <ul className="lesson-outcomes">{results.map((result, index) => <li key={index}>{result}</li>)}</ul>}
        {(accentLabel || strong || weak) && <div className="lesson-legend" aria-label="Diagram key">
          {accentLabel && <>
            <span><i className="lesson-key-pattern" aria-hidden="true" /><span>{copy?.patternLabel ?? mainLabel}</span></span>
            <span><i className="lesson-key-accent" aria-hidden="true" /><span>{copy?.accentLabel ?? accentLabel}</span></span>
          </>}
          {strong && <span><i className="lesson-key-link" aria-hidden="true" /><span>{copy?.strongLabel ?? 'Strong link. At least one is true.'}</span></span>}
          {weak && <span><i className="lesson-key-link dashed" aria-hidden="true" /><span>{copy?.weakLabel ?? 'Weak link. At most one is true.'}</span></span>}
        </div>}
        {trace && <details className="lesson-proof">
          <summary><span>{copy?.proofTitle ?? 'Read the proof step by step'}</span></summary>
          {trace.map(({ assumption, steps, conclusion }, index) => <div key={index}>
            <p>{assumption}</p>
            <ol>{steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
            <p>{conclusion}</p>
          </div>)}
        </details>}
      </figcaption>
    </figure>
  )
}

export function Practice({ block, variant }: { block: Extract<LessonBlock, { type: 'practice' }>; variant: string }) {
  const { drills, title, selectLabel } = block
  const [chosen, setChosen] = useState(() => drills.find(({ example }) => example === variant) ?? drills[0])
  const heading = useId()
  return (
    <section className="surface lesson-practice" aria-labelledby={heading}>
      <header className="lesson-practice-heading">
        <h2 id={heading}>{title ?? 'Try a move'}</h2>
        {drills.length > 1 && <label className="lesson-drill">
          <span>{selectLabel ?? 'Technique'}</span>
          <SelectControl value={chosen.example} onChange={(event) => {
            const next = drills.find(({ example }) => example === event.target.value)
            if (next) setChosen(next)
          }}>
            {drills.map(({ example, title }) => <option key={example} value={example}>{title}</option>)}
          </SelectControl>
        </label>}
      </header>
    <PracticePuzzle key={chosen.example} puzzle={lessonExamples[chosen.example].practice} technique={chosen.title} instruction={block.instruction} />
    </section>
  )
}

export function Block({ block, variant }: { block: LessonBlock; variant: string }) {
  switch (block.type) {
    case 'heading': return <h2 className="article-subheading" id={block.id}>{block.title}</h2>
    case 'text': return <>{block.paragraphs.map((paragraph, index) => <p className="article-paragraph" key={index}>{paragraph}</p>)}</>
    case 'list': return <ul className="article-list">{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    case 'diagram': return <Diagram example={lessonExamples[block.example]} crop={block.region} copy={block.copy} />
    case 'practice': return <Practice block={block} variant={variant} />
  }
}

export function TechniqueLesson({ lesson, variant }: { lesson: LessonArticle; variant: string }) {
  const index = articles.indexOf(lesson)
  const previous = articles[index - 1]
  const next = articles[index + 1]

  useEffect(() => {
    if (variant === lesson.id || window.location.hash) return
    const frame = requestAnimationFrame(() => document.getElementById(variant)?.scrollIntoView())
    return () => cancelAnimationFrame(frame)
  }, [lesson.id, variant])

  return (
    <article className="technique-lesson">
      <header className="lesson-heading">
        <LearnBreadcrumbs current={lesson.title} />
        <p>{lesson.summary}</p>
      </header>

      <div className="lesson-article">
        {lesson.blocks.map((block, index) => <Block key={index} block={block} variant={variant} />)}
      </div>

      <section className="lesson-references" aria-labelledby="see-also-title">
        <h2 id="see-also-title">{lesson.referencesTitle ?? 'See also'}</h2>
        <ul>{lesson.references.map(({ label, href }, index) => <li key={index}>
          <a href={href}><span>{label}</span> <ArrowUpRight size={14} aria-hidden="true" /></a>
        </li>)}</ul>
        {Boolean(lesson.credits?.length) && <p><span>{lesson.creditsPrefix ?? 'Some example positions come from'}</span>{' '}
          {lesson.credits?.map(({ label, href }, index) => <Fragment key={index}>
            {index > 0 && ', '}<a href={href}>{label}</a>
          </Fragment>)}.</p>}
      </section>

      <nav className="lesson-neighbors" aria-label="Adjacent articles">
        {previous && <Link to="/learn/$technique" params={{ technique: previous.id }} className="button secondary">
          <ArrowLeft size={16} aria-hidden="true" /> {previous.title}
        </Link>}
        {next && <Link to="/learn/$technique" params={{ technique: next.id }} className="button secondary lesson-next">
          {next.title} <ArrowRight size={16} aria-hidden="true" />
        </Link>}
      </nav>
    </article>
  )
}
