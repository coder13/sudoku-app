import { Button, buttonClassName } from './Button'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { techniqueDifficulties } from '../sudoku/technique-difficulties'
import { lessonDifficultyLabels } from '../sudoku/lesson-difficulties'
import { Link, useLocation } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import aliasesJson from '../sudoku/generated/lesson-aliases.json'
import examplesJson from '../sudoku/generated/lesson-examples.json?raw'
import { lessonDiagram, lessonValues } from '../sudoku/lesson-diagram'
import { lessonExample, type EngineLessonExample, type LessonExercise } from '../sudoku/lesson-examples'
import { lessonReadingOrder } from '../sudoku/lesson-difficulties'
import { lessonRoutes, type LessonArticle, type LessonBlock } from '../sudoku/lessons'
import { generateLessonExercise, loadWorkedExample, readWorkedExampleNumber, saveWorkedExampleNumber, type WorkedExample } from '../sudoku/worked-examples'
import { LessonWorkbench } from './LessonWorkbench'
import { LearnHeading, LessonDifficulty } from './LearnHeading'
import { PracticePuzzle } from './LessonPractice'
import { SelectControl } from './SelectControl'
import { ConceptCheck } from './ConceptCheck'
import { FoundationVisual } from './FoundationVisual'
import { hasPracticePuzzles } from '../sudoku/practice-play'
import { usePuzzleGeneration } from './usePuzzleGeneration'

const lessonExamples = JSON.parse(examplesJson) as Record<string, EngineLessonExample>
const techniqueAliases: Readonly<Record<string, readonly string[]>> = aliasesJson
type DiagramBlock = Extract<LessonBlock, { type: 'diagram' }>
type PracticeBlock = Extract<LessonBlock, { type: 'practice' }>

export function Diagram({ example, block, blockIndex, editorPreview, fallbackReason }: {
  example: WorkedExample
  block?: DiagramBlock
  blockIndex?: number
  editorPreview?: boolean
  fallbackReason?: string
}) {
  const { region: crop, copy, notes } = block ?? {}
  const { annotations, region, description, reason, reasonSteps, mainLabel, accentLabel, results: defaultResults, trace: defaultTrace } = lessonDiagram(example)
  const view = crop ?? (block && !example.variantPuzzle ? region : undefined)
  const results = copy?.results ?? defaultResults
  const trace = copy?.trace ?? defaultTrace
  const strong = annotations.links?.some((link) => !link.dashed)
  const weak = annotations.links?.some((link) => link.dashed && !link.arrow)
  const summary = copy?.description ?? description
  const explanation = copy?.reason ?? (reasonSteps ? undefined : reason || fallbackReason)
  return (
    <figure className="lesson-diagram" data-lesson-block={blockIndex}>
      <LessonWorkbench puzzle={example} region={view} annotations={annotations} label="Sudoku diagram" preview />
      <figcaption>
        {(summary || editorPreview) && <p className="lesson-diagram-summary">{summary}</p>}
        {reasonSteps && !copy?.reason && <ol className="lesson-reason-steps">{reasonSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>}
        {(explanation || editorPreview) && <p className="lesson-diagram-reason">{explanation}</p>}
        {notes && <div className="lesson-example-notes" id={notes.id}>
          {notes.title && <h3>{notes.title}</h3>}
          {notes.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>}
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

function WorkedExampleViewer({ article, technique, diagrams, fallbackReason }: {
  article: string
  technique: string
  diagrams: DiagramBlock[]
  fallbackReason?: string
}) {
  const initial = useMemo(() => lessonExample(lessonExamples[technique]), [technique])
  const authoredCount = Math.max(1, diagrams.length)
  const latestRequest = useRef(0)
  const [current, setCurrent] = useState<{ number: number; example?: WorkedExample }>({ number: 0 })
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const hash = useLocation({ select: location => location.hash })

  const showExample = useCallback(async (number: number, save = true) => {
    const request = ++latestRequest.current
    if (number < authoredCount) {
      setCurrent({ number })
      setStatus('idle')
      if (save) void saveWorkedExampleNumber(article, technique, number)
      return
    }
    setStatus('loading')
    try {
      const { example } = await loadWorkedExample(technique, number - authoredCount + 1, initial)
      if (request !== latestRequest.current) return
      setCurrent({ number, example })
      setStatus('idle')
      if (save) void saveWorkedExampleNumber(article, technique, number)
    } catch {
      if (request === latestRequest.current) setStatus('error')
    }
  }, [article, technique, initial, authoredCount])

  useEffect(() => {
    const anchoredExample = hash === 'worked-example' ? 0 : diagrams.findIndex(({ notes }) => notes?.id === hash)
    if (anchoredExample >= 0) {
      void showExample(anchoredExample, false)
      const frame = requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView())
      return () => { cancelAnimationFrame(frame); latestRequest.current++ }
    }
    const request = latestRequest.current
    void readWorkedExampleNumber(article, technique, authoredCount, Boolean(initial.variantPuzzle)).then(number => {
      if (request === latestRequest.current && Number.isSafeInteger(number) && number > 0) {
        void showExample(number)
      }
    })
    return () => { latestRequest.current++ }
  }, [article, authoredCount, diagrams, hash, initial.variantPuzzle, showExample, technique])

  const block = current.example ? undefined : diagrams[current.number]
  const example = current.example ?? (block && block.example !== technique ? lessonExample(lessonExamples[block.example]) : initial)
  const loading = status === 'loading'
  return <>
    <div className="lesson-example-controls" role="group" aria-label="Example navigation">
      <span>Example {current.number + 1}</span>
      <div>
        <Button type="button" aria-label="Previous example" disabled={loading || current.number === 0}
          onClick={() => void showExample(current.number - 1)}>Previous</Button>
        <Button type="button" aria-label="Next example" disabled={loading}
          onClick={() => void showExample(current.number + 1)}>Next</Button>
      </div>
    </div>
    <p role="status" className={status === 'error' ? 'lesson-new-example-error' : 'sr-only'}>
      {loading ? 'Loading example…' : status === 'error' ? 'Could not load the example. Try again.' : `Example ${current.number + 1} ready.`}
    </p>
    <Diagram key={current.number} example={example} block={block} fallbackReason={fallbackReason} />
  </>
}

function WorkedExamples({ article, block, variant, diagrams, editorPreview }: {
  article: string
  block: PracticeBlock
  variant: string
  diagrams: { block: DiagramBlock; index: number }[]
  editorPreview: boolean
}) {
  const { drills, selectLabel } = block
  const [technique, setTechnique] = useState(() => drills.find(({ example }) => example === variant)?.example ?? drills[0].example)
  const authored = useMemo(() => diagrams.map(({ block }) => block).filter(({ example }) =>
    example === technique || (technique === drills[0].example && !drills.some(drill => drill.example === example))),
  [diagrams, drills, technique])
  return <section className="surface lesson-worked-examples" id="worked-example" aria-labelledby="examples">
    <header className="lesson-practice-heading">
      <h2 id="examples">Examples</h2>
      {!editorPreview && drills.length > 1 && <label className="lesson-drill">
        <span>{selectLabel ?? 'Technique'}</span>
        <SelectControl value={technique} onChange={event => setTechnique(event.target.value)}>
          {drills.map(({ example, title }) => <option key={example} value={example}>{title}</option>)}
        </SelectControl>
      </label>}
    </header>
    {editorPreview ? diagrams.map(({ block, index }) =>
      <Diagram key={index} example={lessonExample(lessonExamples[block.example])} block={block} blockIndex={index} editorPreview />)
      : <WorkedExampleViewer key={technique} article={article} technique={technique}
          diagrams={authored} fallbackReason={block.guide?.reason} />}
  </section>
}

export function Practice({ block, variant, blockIndex, editorPreview }: {
  block: PracticeBlock; variant: string; blockIndex?: number; editorPreview?: boolean
}) {
  const { drills, title, selectLabel } = block
  const [chosen, setChosen] = useState(() => drills.find(({ example }) => example === variant) ?? drills[0])
  const [generated, setGenerated] = useState<LessonExercise | null>(null)
  const [generation, setGeneration] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [ready, setReady] = useState(false)
  const generationId = useRef(0)
  const initial = useMemo(() => lessonExample(lessonExamples[chosen.example]).practice, [chosen.example])
  const puzzle = generated ?? initial
  const grid = lessonValues(puzzle)
  const difficulty = techniqueDifficulties[chosen.example]
  const { busy: startingPractice, error: practiceError, generatePractice } = usePuzzleGeneration()
  useEffect(() => {
    setReady(true)
    return () => { generationId.current++ }
  }, [])

  async function newExample() {
    const id = ++generationId.current
    setGeneration('loading')
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const example = await generateLessonExercise(chosen.example, seed, grid, Boolean(initial.variantPuzzle))
      if (id !== generationId.current) return
      setGenerated(example)
      setGeneration('ready')
    } catch {
      if (id === generationId.current) setGeneration('error')
    }
  }

  return (
    <section className="surface lesson-practice" aria-labelledby="trainer" data-lesson-block={blockIndex}>
      <header className="lesson-practice-heading">
        <div>
          <div className="lesson-title-row">
            <h2 id="trainer">Trainer</h2>
            {difficulty && <LessonDifficulty label={DIFFICULTY_LABELS[difficulty]} />}
          </div>
          {(title || editorPreview) && <p className="lesson-trainer-title">{title}</p>}
        </div>
        <div className="lesson-practice-heading-actions">
          {drills.length > 1 && <label className="lesson-drill">
            <span>{selectLabel ?? 'Technique'}</span>
            <SelectControl value={chosen.example} disabled={!ready || startingPractice} onChange={(event) => {
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
          <Button type="button" className="lesson-new-example" disabled={!ready || generation === 'loading' || startingPractice}
            aria-busy={generation === 'loading'} onClick={newExample}>
            <RefreshCw size={16} aria-hidden="true" /> New example
          </Button>
          {!editorPreview && hasPracticePuzzles(chosen.example) &&
            <Button type="button" variant="primary" disabled={!ready || startingPractice} aria-busy={startingPractice}
              onClick={() => { void generatePractice(chosen.example) }}>
              {startingPractice ? 'Generating puzzle…' : 'Play practice puzzles'}
            </Button>}
        </div>
      </header>
      <p role="status" className={generation === 'error' ? 'lesson-new-example-error' : 'sr-only'}>
        {generation === 'loading' ? 'Generating example…' : generation === 'ready' ? 'New example ready.'
          : generation === 'error' ? 'Could not generate an example. Try again.' : ''}
      </p>
      {practiceError && <p role="alert" className="lesson-new-example-error">{practiceError}</p>}
      <PracticePuzzle key={`${chosen.example}:${grid}`} puzzle={puzzle} technique={chosen.title} instruction={block.instruction} practiceGuide={block.guide} />
    </section>
  )
}

function alternateNames(id: string, title: string, extra: readonly string[] = []) {
  const label = title.toLowerCase()
  return [...new Set([...(techniqueAliases[id] ?? []), ...extra])]
    .filter(name => name.toLowerCase() !== label && `${name.toLowerCase()}s` !== label)
}

function LessonTags({ label, children }: { label: string; children: ReactNode }) {
  return <ul className="lesson-tags" role="list" aria-label={label}>
    <li className="lesson-tag-label" aria-hidden="true">{label}</li>
    {children}
  </ul>
}

function AlternateNames({ names, technique }: { names: string[]; technique?: string }) {
  if (!names.length) return null
  return <LessonTags label={technique ? `Other names for ${technique}` : 'Also called'}>
    {names.map(name => <li key={name}><span className="lesson-chip lesson-alias-chip">{name}</span></li>)}
  </LessonTags>
}

export function ExplanationBlock({ block, index, drills }: { block: LessonBlock; index: number; drills: PracticeBlock['drills'] }) {
  switch (block.type) {
    case 'heading': return <>
      <h2 className="article-subheading" id={block.id} data-lesson-block={index}>{block.title}</h2>
      {drills.some(({ example }) => example === block.id) &&
        <AlternateNames names={alternateNames(block.id, block.title)} />}
    </>
    case 'text': return <>{block.paragraphs.map((paragraph, paragraphIndex) =>
      <p className="article-paragraph" key={paragraphIndex} data-lesson-block={index}>{paragraph}</p>)}</>
    case 'list': return <ul className="article-list" data-lesson-block={index}>
      {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
    </ul>
    case 'table': return <div className="lesson-table-scroll" data-lesson-block={index}><table className="lesson-table">
      <caption>{block.caption}</caption>
      <thead><tr>{block.columns.map((column, i) => <th scope="col" key={i}>{column}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
    case 'concept-check': return <div data-lesson-block={index}><ConceptCheck block={block} /></div>
    case 'foundation-visual': return <div data-lesson-block={index}><FoundationVisual visual={block.visual} /></div>
    default: return null
  }
}

export function TechniqueLesson({ lesson, variant, editorPreview = false }: {
  lesson: LessonArticle; variant: string; editorPreview?: boolean
}) {
  const showEditableExamples = useLocation({
    select: ({ searchStr }) => editorPreview && new URLSearchParams(searchStr).has('preview'),
  })
  const index = lessonReadingOrder.indexOf(lesson)
  const previous = lessonReadingOrder[index - 1]
  const next = lessonReadingOrder[index + 1]
  const practice = lesson.blocks.find(block => block.type === 'practice')
  const drills = practice?.drills ?? []
  const diagrams = useMemo(() => lesson.blocks.flatMap((block, index) =>
    block.type === 'diagram' ? [{ block, index }] : []), [lesson.blocks])
  const headings = new Set(lesson.blocks.flatMap(block => block.type === 'heading' ? [block.id] : []))

  useEffect(() => {
    if (variant === lesson.id || window.location.hash) return
    const frame = requestAnimationFrame(() => document.getElementById(variant)?.scrollIntoView())
    return () => cancelAnimationFrame(frame)
  }, [lesson.id, variant])

  return (
    <article className="technique-lesson">
      <LearnHeading title={lesson.title} difficulty={lessonDifficultyLabels.get(lesson.id)}>
        <div className="lesson-metadata">
          {!!lesson.prerequisites?.length && <LessonTags label="Learn first">
            {lesson.prerequisites.map(id => <li key={id}>
              <Link to="/learn/$technique" params={{ technique: id }} className="lesson-chip lesson-prerequisite-link">
                <span>{lessonRoutes.get(id)?.title ?? id}</span><ArrowRight size={12} aria-hidden="true" />
              </Link>
            </li>)}
          </LessonTags>}
          <AlternateNames names={alternateNames(lesson.id, lesson.title, lesson.aliases)} />
          {drills.filter(({ example }) => example !== lesson.id && !headings.has(example) && lesson.id !== 'fundamentals')
            .map(({ example, title }) => <AlternateNames key={example} names={alternateNames(example, title)} technique={title} />)}
        </div>
      </LearnHeading>

      <div className="lesson-article">
        <section className="lesson-explanation" id="explanation" aria-label="Explanation">
          <p className="article-paragraph" data-lesson-intro>{lesson.summary}</p>
          {lesson.blocks.map((block, index) => <ExplanationBlock key={index} block={block} index={index} drills={drills} />)}
        </section>
        {practice && <>
          <WorkedExamples article={lesson.id} block={practice} variant={variant} diagrams={diagrams} editorPreview={showEditableExamples} />
          <Practice block={practice} variant={variant} blockIndex={lesson.blocks.indexOf(practice)} editorPreview={showEditableExamples} />
        </>}
      </div>

      {(lesson.references.length > 0 || Boolean(lesson.credits?.length) || editorPreview) && <section className="lesson-references" aria-labelledby="see-also-title">
        <h2 id="see-also-title">{lesson.referencesTitle ?? 'See also'}</h2>
        <ul>{lesson.references.map(({ label, href }, index) => <li key={index}>
          <a href={href}><span>{label}</span> <ArrowUpRight size={14} aria-hidden="true" /></a>
        </li>)}</ul>
        {Boolean(lesson.credits?.length) && <p><span>{lesson.creditsPrefix ?? 'Some example positions come from'}</span>{' '}
          {lesson.credits?.map(({ label, href }, index) => <Fragment key={index}>
            {index > 0 && ', '}<a href={href}>{label}</a>
          </Fragment>)}.</p>}
      </section>}

      <nav className="lesson-neighbors" aria-label="Adjacent articles">
        {previous && <Link to="/learn/$technique" params={{ technique: previous.id }} className={buttonClassName()}>
          <ArrowLeft size={16} aria-hidden="true" /> {previous.title}
        </Link>}
        {next && <Link to="/learn/$technique" params={{ technique: next.id }} className={buttonClassName('secondary', 'lesson-next')}>
          {next.title} <ArrowRight size={16} aria-hidden="true" />
        </Link>}
      </nav>
    </article>
  )
}
