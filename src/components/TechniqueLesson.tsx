import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
import { lessonDifficultyLabels } from '../sudoku/lesson-difficulties'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { runEngine, type LessonExample } from '../sudoku/engine'
import examplesJson from '../sudoku/generated/lesson-examples.json?raw'
import { lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { lessonExample, variantLessonExercise, type EngineLessonExample, type LessonExercise } from '../sudoku/lesson-examples'
import { articles, lessonRoutes, type LessonArticle, type LessonBlock } from '../sudoku/lessons'
import { LessonWorkbench } from './LessonWorkbench'
import type { BoardRegion } from './BoardAnnotations'
import { LearnBreadcrumbs } from './LearnBreadcrumbs'
import { PracticePuzzle } from './LessonPractice'
import { SelectControl } from './SelectControl'
import { ConceptCheck } from './ConceptCheck'
import { FoundationVisual } from './FoundationVisual'

const lessonExamples = JSON.parse(examplesJson) as Record<string, EngineLessonExample>

export function Diagram({ example, crop, copy }: {
  example: LessonExample & Pick<LessonExercise, 'variantPuzzle'>
  crop?: BoardRegion
  copy?: Extract<LessonBlock, { type: 'diagram' }>['copy']
}) {
  const { annotations, region, description, reason, reasonSteps, mainLabel, accentLabel, results: defaultResults, trace: defaultTrace } = lessonDiagram(example)
  const view = crop ?? (example.variantPuzzle ? undefined : region)
  const results = copy?.results ?? defaultResults
  const trace = copy?.trace ?? defaultTrace
  const strong = annotations.links?.some((link) => !link.dashed)
  const weak = annotations.links?.some((link) => link.dashed && !link.arrow)
  return (
    <figure className="lesson-diagram">
      <LessonWorkbench puzzle={example} region={view} annotations={annotations} label="Sudoku diagram" />
      <figcaption>
        <p>{copy?.description ?? description}</p>
        {reasonSteps && !copy?.reason ? <ol className="lesson-reason-steps">{reasonSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          : <p>{copy?.reason ?? reason}</p>}
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
  const [generated, setGenerated] = useState<LessonExercise | null>(null)
  const [generation, setGeneration] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const generationId = useRef(0)
  const initial = useMemo(() => lessonExample(lessonExamples[chosen.example]).practice, [chosen.example])
  const puzzle = generated ?? initial
  const grid = lessonValues(puzzle)
  const heading = useId()

  async function newExample() {
    const id = ++generationId.current
    setGeneration('loading')
    try {
      let example: LessonExercise
      if (initial.variantPuzzle) {
        const exercises = await runEngine({ type: 'practice-examples', technique: chosen.example, variant: true }, { background: true })
        const current = exercises.findIndex(({ position }) => lessonValues({ givens: position.puzzle.givens, entries: position.entries }) === grid)
        example = variantLessonExercise(exercises[(current + 1) % exercises.length])
      } else {
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]
        example = await runEngine({ type: 'generate-practice-example', technique: chosen.example, seed, exclude: grid })
      }
      if (id !== generationId.current) return
      setGenerated(example)
      setGeneration('ready')
    } catch {
      if (id === generationId.current) setGeneration('error')
    }
  }

  return (
    <section className="surface lesson-practice" aria-labelledby={heading}>
      <header className="lesson-practice-heading">
        <h2 id={heading}>{title ?? 'Try a move'}</h2>
        {techniqueDifficulties[chosen.example] && <small>{DIFFICULTY_LABELS[techniqueDifficulties[chosen.example]!]}</small>}
        <div className="lesson-practice-heading-actions">
          {drills.length > 1 && <label className="lesson-drill">
            <span>{selectLabel ?? 'Technique'}</span>
            <SelectControl value={chosen.example} onChange={(event) => {
              const next = drills.find(({ example }) => example === event.target.value)
              if (!next || next === chosen) return
              generationId.current++
              setChosen(next)
              setGenerated(null)
              setGeneration('idle')
            }}>
              {drills.map(({ example, title }) => <option key={example} value={example}>{title}</option>)}
            </SelectControl>
          </label>}
          <button type="button" className="button secondary lesson-new-example" disabled={generation === 'loading'}
            aria-busy={generation === 'loading'} onClick={newExample}>
            <RefreshCw size={16} aria-hidden="true" /> New example
          </button>
        </div>
      </header>
      <p role="status" className={generation === 'error' ? 'lesson-new-example-error' : 'sr-only'}>
        {generation === 'loading' ? 'Generating example…' : generation === 'ready' ? 'New example ready.'
          : generation === 'error' ? 'Could not generate an example. Try again.' : ''}
      </p>
    <PracticePuzzle key={`${chosen.example}:${grid}`} puzzle={puzzle} technique={chosen.title} instruction={block.instruction} practiceGuide={block.guide} />
    </section>
  )
}

export function Block({ block, variant }: { block: LessonBlock; variant: string }) {
  switch (block.type) {
    case 'heading': return <h2 className="article-subheading" id={block.id}>{block.title}</h2>
    case 'text': return <>{block.paragraphs.map((paragraph, index) => <p className="article-paragraph" key={index}>{paragraph}</p>)}</>
    case 'list': return <ul className="article-list">{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    case 'table': return <div className="lesson-table-scroll"><table className="lesson-table">
      <caption>{block.caption}</caption>
      <thead><tr>{block.columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
    case 'concept-check': return <ConceptCheck block={block} />
    case 'foundation-visual': return <FoundationVisual visual={block.visual} />
    case 'diagram': return <Diagram example={lessonExample(lessonExamples[block.example])} crop={block.region} copy={block.copy} />
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
        {lesson.difficulty && <p className="lesson-course-level">{lessonDifficultyLabels.get(lesson.id)}</p>}
        {!!lesson.prerequisites?.length && <p className="lesson-prerequisites">Learn first: {lesson.prerequisites.map((id, index) => <Fragment key={id}>
          {index > 0 && ', '}<Link to="/learn/$technique" params={{ technique: id }}>{lessonRoutes.get(id)?.title ?? id}</Link>
        </Fragment>)}</p>}
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
