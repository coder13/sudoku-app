import { Link } from '@tanstack/react-router'
import { MoreHorizontal, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import type { DeductionAction, HintChoice } from '../sudoku/engine'
import { runEngine } from '../sudoku/engine'
import { techniqueLabel } from '../sudoku/hints'
import { hintLocation, lessonActionText as actionText, lessonDiagram } from '../sudoku/lesson-diagram'
import { lessonRoutes } from '../sudoku/lessons'
import positions from '../sudoku/practice-positions.json'
import {
  autoPracticeLevel, isPracticeTopic, markPracticeSeen, PRACTICE_LEVELS, PRACTICE_TOPICS, practiceSet, practiceSource,
  recommendedPractice, recordPracticeOutcome, type PracticeLevel, type PracticeOutcome, type PracticePosition, type PracticeTopic,
} from '../sudoku/practice'
import { practiceActions } from '../sudoku/practice-workspace'
import { readPreferences } from '../sudoku/preferences'
import { techniqueActionKey } from '../sudoku/technique-progress'
import { techniqueHistory } from '../sudoku/technique-history'
import { HintCard } from './HintCard'
import { LessonWorkbench } from './LessonWorkbench'
import { usePlayerRating } from './usePuzzleGeneration'

type RoundScore = { outcome: PracticeOutcome; review: boolean; topic: PracticeTopic }
type RoundResult = { proof: HintChoice; action: DeductionAction; score: RoundScore }
type Session = {
  positions: PracticePosition[]
  results: RoundScore[]
  topic?: PracticeTopic
  level: PracticeLevel
}

const outcomes = {
  'first-try': 'Correct on first check',
  retried: 'Correct after a retry',
  hinted: 'Correct with help',
  revealed: 'Move shown',
  skipped: 'Skipped',
}
const mixedPool = positions as PracticePosition[]
const techniques = Object.keys(PRACTICE_TOPICS) as PracticeTopic[]

function techniqueName(id: string) {
  return isPracticeTopic(id) ? PRACTICE_TOPICS[id].name : techniqueLabel(id)
}

function practiceNudge(position: PracticePosition) {
  const { technique, deduction } = position.hint
  const first = deduction.actions[0]
  const { digit } = 'place' in first ? first.place : first.eliminate
  switch (technique) {
    case 'naked-single': return 'Look for a cell with only one candidate.'
    case 'hidden-single': return `Look for a house with only one candidate ${digit}.`
    case 'pointing': return `Look for candidate ${digit} confined to one row or column within a box.`
    case 'claiming': return `Look for candidate ${digit} confined to one box along a row or column.`
    case 'naked-pair': return 'Find two cells in the same house with the same two candidates.'
    case 'x-wing': return `Trace candidate ${digit} across pairs of rows or columns.`
  }
}

function PracticeOptionsMenu({ onOptions }: { onOptions: () => void }) {
  return <details className="puzzle-menu-wrap practice-options-menu" onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
  }} onKeyDown={(event) => {
    if (event.key !== 'Escape' || !event.currentTarget.open) return
    event.stopPropagation()
    event.currentTarget.open = false
    event.currentTarget.querySelector('summary')?.focus()
  }}>
    <summary className="icon-button borderless puzzle-menu-trigger" aria-label="Open practice actions" title="Practice actions">
      <MoreHorizontal size={20} />
    </summary>
    <div className="app-menu puzzle-menu">
      <button onClick={onOptions}><SlidersHorizontal size={17} /> Practice options</button>
    </div>
  </details>
}

function PracticeRound({ puzzle, topic, last, onNext, onOptions }: {
  puzzle: PracticePosition
  topic?: PracticeTopic
  last: boolean
  onNext: (score: RoundScore) => void
  onOptions: () => void
}) {
  const [hintLevel, setHintLevel] = useState(0)
  const [hintOpen, setHintOpen] = useState(false)
  const [retried, setRetried] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [result, setResult] = useState<RoundResult>()
  const [checking, setChecking] = useState(false)
  const review = useRef<boolean | undefined>(undefined)
  const request = useRef(0)
  const inFlight = useRef(false)
  const nextButton = useRef<HTMLButtonElement>(null)
  const [preferences] = useState(readPreferences)
  const [chosenAction, chooseAction] = useState<string>()
  const { hint } = puzzle
  const source = practiceSource(puzzle)
  const nudge = topic ? practiceNudge(puzzle) ?? lessonRoutes.get(topic)?.summary : undefined
  const isPlacement = 'place' in hint.deduction.actions[0]
  const location = hintOpen && hintLevel === 2 && !result
    ? hintLocation({ ...hint.deduction, pattern: hint.pattern }, preferences.cellReferenceStyle) : undefined
  const diagram = result ? lessonDiagram({ deduction: result.proof, candidates: puzzle.candidates }, result.proof.pattern) : undefined

  useEffect(() => {
    review.current ??= markPracticeSeen(source)
    return () => { request.current++ }
  }, [source])
  useEffect(() => { if (result) nextButton.current?.focus() }, [result])

  function record(outcome: PracticeOutcome) {
    const score = { outcome, review: review.current ?? false, topic: hint.technique }
    recordPracticeOutcome(source, topic ? 'named' : 'mixed', { outcome, review: score.review })
    return score
  }

  async function check(attempt: DeductionAction | undefined) {
    if (!attempt || inFlight.current || result) return
    const id = ++request.current
    inFlight.current = true
    setFeedback('')
    setChecking(true)
    try {
      const proof = await runEngine({
        type: 'practice-proof', values: puzzle.givens, entries: puzzle.entries, eliminations: puzzle.eliminations,
        preferredTechnique: topic, action: attempt,
      }, { background: true })
      if (id !== request.current) return
      if (!proof) {
        setRetried(true)
        setFeedback('Try a different move.')
      } else if (topic && proof.technique !== topic) {
        setRetried(true)
        setFeedback(`${techniqueName(proof.technique)} supports that move. Find a move using ${techniqueName(topic)}.`)
      } else {
        const outcome = hintLevel ? 'hinted' : retried ? 'retried' : 'first-try'
        setResult({ proof, action: attempt, score: record(outcome) })
      }
    } catch {
      if (id === request.current) setFeedback('Couldn’t check that move. Try again.')
    } finally {
      if (id === request.current) {
        inFlight.current = false
        setChecking(false)
      }
    }
  }

  function showMove() {
    const { deduction, pattern } = hint
    setResult({ proof: { ...deduction, pattern }, action: deduction.actions[0], score: record('revealed') })
  }

  function openHint() {
    setHintLevel((level) => Math.max(topic && !nudge ? 2 : 1, level))
    setHintOpen(true)
  }

  const namedInstruction = isPlacement ? 'Find one digit you can place.' : 'Find one candidate you can remove.'
  const status = result
    ? `${result.score.outcome === 'revealed' ? 'One possible move.' : 'Correct.'} ${actionText(result.action)}`
    : checking ? 'Checking move…'
    : feedback

  if (result && diagram) return <div className="practice-result-grid">
    <div className="practice-result-grid-column">
      <PracticeOptionsMenu onOptions={onOptions} />
      <LessonWorkbench puzzle={puzzle} annotations={diagram.annotations} label="Practice grid" preview />
    </div>
    <div className="lesson-practice-controls">
      <p className="lesson-practice-feedback" role="status"
        data-result={result.score.outcome !== 'revealed' ? 'correct' : undefined}>{status}</p>
      <div className="surface practice-explanation">
        <h3>{techniqueName(result.proof.technique)}</h3>
        {diagram.description && <p>{diagram.description}</p>}
        {diagram.reason && <p>{diagram.reason}</p>}
        {result.proof.actions.length > 1 && <ul className="lesson-outcomes">
          {diagram.results.map((line) => <li key={line}>{line}</li>)}
        </ul>}
        {diagram.trace && <details className="lesson-proof">
          <summary>Read the proof step by step</summary>
          {diagram.trace.map(({ assumption, steps, conclusion }) => <div key={assumption}>
            <p>{assumption}</p>
            <ol>{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
            <p>{conclusion}</p>
          </div>)}
        </details>}
      </div>
      <div className="lesson-practice-actions">
        <button className="button primary" ref={nextButton} onClick={() => onNext(result.score)}>{last ? 'See results' : 'Next position'}</button>
        {lessonRoutes.has(result.proof.technique) && <Link className="button quiet" to="/learn/$technique"
          params={{ technique: result.proof.technique }}>Read lesson</Link>}
      </div>
    </div>
  </div>

  return <>
    <PracticeOptionsMenu onOptions={onOptions} />
    <LessonWorkbench puzzle={puzzle} label="Practice grid" annotations={location?.annotations}
      initialPencil={Boolean(topic && !isPlacement)} collectActions={practiceActions}
      onEdit={() => setFeedback('')}>
      {({ actions }) => {
        const attempt = actions.find((action) => techniqueActionKey(action) === chosenAction) ?? actions[0]
        return <div className="lesson-practice-controls">
          {actions.length > 1 && <div className="lesson-drill">
            <label htmlFor="practice-checked-move">Move to check</label>
            <select id="practice-checked-move" value={attempt && techniqueActionKey(attempt)} disabled={checking}
              onChange={(event) => { chooseAction(event.target.value); setFeedback('') }}>
              {actions.map((action) => <option key={techniqueActionKey(action)}
                value={techniqueActionKey(action)}>{actionText(action)}</option>)}
            </select>
          </div>}
          <p className="lesson-practice-feedback" role="status">{status ||
            (attempt ? actionText(attempt) : topic ? namedInstruction : 'Place a digit or remove a candidate.')}</p>
          <div className="lesson-practice-actions">
            <button className="button primary" disabled={!attempt || checking} onClick={() => void check(attempt)}>Check move</button>
            <button className="button secondary" disabled={checking} onClick={openHint}>Hint</button>
            <button className="button quiet" disabled={checking} onClick={() => onNext(record('skipped'))}>Skip position</button>
          </div>
          {hintOpen && <HintCard hint={{
            title: techniqueName(hint.technique),
            text: [nudge, location?.text].filter(Boolean).join(' '),
          }} onClose={() => setHintOpen(false)} action={hintLevel < 2
            ? { label: 'Show location', onClick: () => setHintLevel(2) }
            : { label: 'Show move', onClick: showMove }} />}
        </div>
      }}
    </LessonWorkbench>
  </>

}

export function PracticePage({ initialTopic }: { initialTopic?: PracticeTopic }) {
  const [topic, setTopic] = useState<PracticeTopic>(initialTopic ?? 'naked-single')
  const [difficulty, setDifficulty] = useState<'auto' | PracticeLevel>('auto')
  const [session, setSession] = useState<Session>()
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const loadId = useRef(0)
  const { recommended } = usePlayerRating()
  const progress = useSyncExternalStore(techniqueHistory.subscribe, techniqueHistory.getSnapshot, techniqueHistory.getServerSnapshot)
  const suggestion = recommendedPractice(progress)
  const autoLevel = autoPracticeLevel(recommended)
  const level = difficulty === 'auto' ? autoLevel : difficulty
  const round = session?.results.length ?? 0
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (session) heading.current?.focus()
  }, [session])

  async function start(selected?: PracticeTopic, nextLevel = level) {
    if (loading) return
    setLoadError(false)
    const id = ++loadId.current
    const avoid = session?.positions.map(({ givens }) => givens)
    try {
      let available = mixedPool
      if (selected) {
        setLoading(true)
        const { default: library } = await import('../sudoku/generated/practice-exercises.json')
        available = [...mixedPool, ...(library[selected] as PracticePosition[])]
      }
      if (id !== loadId.current) return
      const chosen = practiceSet(available, nextLevel, selected, avoid)
      if (!chosen.length) throw new Error('Missing practice positions')
      setSession({ topic: selected, level: nextLevel, positions: chosen, results: [] })
    } catch {
      if (id === loadId.current) setLoadError(true)
    } finally {
      if (id === loadId.current) setLoading(false)
    }
  }

  function advance(score: RoundScore) {
    setSession((current) => current && { ...current, results: [...current.results, score] })
  }

  function openOptions() {
    loadId.current++
    setLoading(false)
    setLoadError(false)
    setSession(undefined)
  }

  const position = session?.positions[round]
  const reviewTopic = position ? undefined : session?.results.find(({ outcome }) =>
    outcome === 'hinted' || outcome === 'revealed' || (session.topic !== undefined && outcome === 'retried'))?.topic
  const followUpTopic = session?.topic ?? reviewTopic
  const reviewCount = session?.results.filter(({ review }) => review).length ?? 0

  return <article className="practice-page">
    <header className="lesson-heading"><h1>Practice</h1></header>
    {loadError && <p className="form-error" role="alert">Couldn’t load practice positions. Try again.</p>}
    {session ? <section className="practice-session" aria-labelledby="practice-session-heading">
      <header className="lesson-practice-heading practice-session-heading">
        <h2 ref={heading} tabIndex={-1} id="practice-session-heading" aria-describedby={position ? 'practice-position-count' : undefined}>
          {position ? session.topic ? techniqueName(session.topic) : 'Find one move' : 'Set complete'}
        </h2>
        {position ? <p className="practice-position-count" id="practice-position-count">Position {round + 1} of {session.positions.length}</p>
          : <PracticeOptionsMenu onOptions={openOptions} />}
      </header>
      {position ? <PracticeRound key={position.givens} puzzle={position} topic={session.topic}
        last={round === session.positions.length - 1} onNext={advance} onOptions={openOptions} /> : <>
        <dl className="practice-results">
          {Object.entries(outcomes).map(([outcome, label]) => {
            const count = session.results.filter((result) => result.outcome === outcome).length
            return count > 0 && <div key={outcome}><dt>{label}</dt><dd>{count}</dd></div>
          })}
          {reviewCount > 0 && <div><dt>Review positions</dt><dd>{reviewCount}</dd></div>}
        </dl>
        <div className="lesson-practice-actions">
          <button className="button primary" disabled={loading} onClick={() => { void start(session.topic, session.level) }}>
            {loading ? 'Loading positions…' : 'Another set'}
          </button>
          {reviewTopic && reviewTopic !== session.topic && <button className="button secondary"
            disabled={loading} onClick={() => { void start(reviewTopic, session.level) }}>Practice {techniqueName(reviewTopic)}</button>}
          <Link className="button quiet" to="/find-difficulty" search={{ technique: followUpTopic }}>Try a full puzzle</Link>
        </div>
      </>}
    </section> : <div className="practice-options-grid">
      <section aria-labelledby="mixed-practice-heading" className="surface practice-choice">
        <h2 id="mixed-practice-heading">Find one move</h2>
        <p>The technique is hidden in each of five positions.</p>
        <div className="lesson-drill">
          <label htmlFor="practice-difficulty">Difficulty</label>
          <select id="practice-difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as 'auto' | PracticeLevel)}>
            <option value="auto">Auto · {PRACTICE_LEVELS[autoLevel]}</option>
            {Object.entries(PRACTICE_LEVELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <button className="button primary" disabled={loading} onClick={() => { void start() }}>Start mixed practice</button>
      </section>
      <section aria-labelledby="named-practice-heading" className="surface practice-choice">
        <h2 id="named-practice-heading">Practice a technique</h2>
        <p>Use the same technique across five positions.</p>
        <div className="lesson-drill">
          <label htmlFor="practice-technique">Technique</label>
          <select id="practice-technique" value={topic} disabled={loading} onChange={(event) => {
            if (isPracticeTopic(event.target.value)) setTopic(event.target.value)
          }}>
            {Object.entries(DIFFICULTY_LABELS).map(([difficulty, label]) => <optgroup key={difficulty} label={label}>
              {techniques.filter((id) => PRACTICE_TOPICS[id].difficulty === difficulty)
                .map((id) => <option key={id} value={id}>{techniqueName(id)}</option>)}
            </optgroup>)}
          </select>
        </div>
        <button className="button primary" disabled={loading} onClick={() => { void start(topic) }}>
          {loading ? 'Loading positions…' : 'Start technique practice'}
        </button>
        {!initialTopic && suggestion && <div className="practice-suggestion">
          <p>You’ve often used hints for {techniqueName(suggestion.technique)}.</p>
          <button className="button secondary" disabled={loading} onClick={() => { void start(suggestion.technique) }}>
            Practice {techniqueName(suggestion.technique)}
          </button>
        </div>}
      </section>
    </div>}
  </article>
}
