import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { DIFFICULTY_LABELS, DIFFICULTY_LEVELS } from '../sudoku/difficulty'
import { difficultyCheckStore, type DifficultyCheck, type DifficultyFeedback, type TechniquePreferences } from '../sudoku/difficulty-check'
import { generateDifficultyCheck } from '../sudoku/difficulty-check-generation'
import { EngineError } from '../sudoku/engine'
import { createGameId, makeGame, type Game } from '../sudoku/game'
import { isPracticeTopic, PRACTICE_TOPICS, type PracticeTopic } from '../sudoku/practice'
import { roomStore } from '../sudoku/storage'
import { usePlayerRating, usePuzzleGeneration } from './usePuzzleGeneration'

function useDifficultyCheck() {
  return useSyncExternalStore(difficultyCheckStore.subscribe, difficultyCheckStore.getSnapshot, difficultyCheckStore.getServerSnapshot)
}

const choices: [DifficultyFeedback, string][] = [
  ['too-easy', 'Too easy'], ['about-right', 'About right'], ['too-hard', 'Too hard'],
]
const topics = Object.keys(PRACTICE_TOPICS) as PracticeTopic[]

export function DifficultyCheckFeedback({ game, solved = false }: { game: Game; solved?: boolean }) {
  const { check } = useDifficultyCheck()
  const navigate = useNavigate()
  if (!check || check.id !== game.difficultyCheck || check.gameId !== game.id) {
    return solved ? <section className="surface difficulty-check-feedback">
      <h2>Puzzle solved</h2>
      <Link to="/puzzles/new">New puzzle</Link>
    </section> : null
  }
  return <section className="surface difficulty-check-feedback" aria-label="Difficulty check feedback">
    {solved && <h2>Puzzle solved</h2>}
    <p>How difficult was this puzzle?</p>
    <div className="difficulty-check-actions">
      {choices.map(([value, label]) => <button className="button secondary" type="button" key={value} onClick={() => {
        if (difficultyCheckStore.record(game.id, value)) void navigate({ to: '/find-difficulty', search: {} })
      }}>{label}</button>)}
    </div>
  </section>
}

export function FindDifficulty({ focus }: { focus?: PracticeTopic }) {
  const { check, techniques } = useDifficultyCheck()
  const { recommended } = usePlayerRating()
  const { games } = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot, roomStore.getServerSnapshot)
  const navigate = useNavigate()
  const next = usePuzzleGeneration()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [canFallback, setCanFallback] = useState(false)
  const [applied, setApplied] = useState(false)
  const [suggested, setSuggested] = useState(focus)
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])

  const trial = check?.gameId ? games.find(game => game.id === check.gameId && game.difficultyCheck === check.id) : undefined
  const profile = suggested && !check
    ? { ...techniques, practice: [suggested, ...techniques.practice.filter(id => id !== suggested)] } : techniques
  const startLevel = focus && profile.practice.includes(focus) ? PRACTICE_TOPICS[focus].difficulty : recommended
  const level = check?.level ?? startLevel

  function setTechnique(topic: PracticeTopic, field: keyof TechniquePreferences, selected: boolean) {
    const list = profile[field].filter(id => id !== topic)
    if (selected) list.push(topic)
    difficultyCheckStore.setTechniques({ ...profile, [field]: list })
    if (topic === suggested && field === 'practice') setSuggested(undefined)
  }

  async function start(fallback = false) {
    if (busy) return
    const active: DifficultyCheck = check ?? difficultyCheckStore.choose(startLevel, profile)
    if (active.gameId) difficultyCheckStore.detach(active.gameId)
    setBusy(true)
    setError('')
    setCanFallback(false)
    const version = ++request.current
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const previous = roomStore.getSnapshot().games.filter(game => !game.variant).map(game => game.givens)
      const preferred = fallback ? { comfortable: [], practice: [] } : profile
      const { board, rating } = await generateDifficultyCheck(active.level, seed, preferred, previous)
      if (version !== request.current || rating.status === 'stalled') return
      const game = {
        ...makeGame(createGameId(), 'Difficulty check', board, 'generated'),
        difficulty: rating.status.solved, score: rating.score.points, difficultyCheck: active.id,
      }
      if (!difficultyCheckStore.attach(active, game.id)) return
      roomStore.add(game)
      void navigate({ to: '/' })
    } catch (reason) {
      if (version !== request.current) return
      const filtered = !fallback && (profile.comfortable.length > 0 || profile.practice.length > 0)
      setCanFallback(filtered && reason instanceof EngineError && reason.code === 'search-limit')
      setError(filtered && reason instanceof EngineError && reason.code === 'search-limit'
        ? 'No puzzle matched these techniques at this level.'
        : 'Couldn’t load a puzzle at this level. Try again.')
    } finally {
      if (version === request.current) setBusy(false)
    }
  }

  function applyPlacement() {
    if (!check?.recommendation) return
    roomStore.setAutoPlacement(check.recommendation)
    difficultyCheckStore.close()
    setApplied(true)
  }

  return <main className="puzzles-page import-page difficulty-check-page" aria-labelledby="difficulty-check-title">
    <Link to="/puzzles/new" className="button quiet">Back to New puzzle</Link>
    <h1 id="difficulty-check-title">Find my difficulty</h1>
    {applied ? <>
      <p>Auto will start at {DIFFICULTY_LABELS[recommended]}.</p>
      <button type="button" className="button primary" disabled={next.busy}
        onClick={() => void next.generate('auto', () => void navigate({ to: '/' }))}>
        {next.busy ? 'Generating…' : 'Start Auto puzzle'}
      </button>
      {next.error && <p className="form-error" role="alert">{next.error}</p>}
    </> : check?.recommendation ? <>
      <p>Recommended for Auto <strong>{DIFFICULTY_LABELS[check.recommendation]}</strong></p>
      <div className="difficulty-check-actions">
        <button type="button" className="button primary" onClick={applyPlacement}>Apply to Auto</button>
        <button type="button" className="button quiet" onClick={difficultyCheckStore.close}>Start another check</button>
      </div>
    </> : <>
      <p>Try a Classic puzzle and say how difficult it felt. You can use the recommendation for Auto when you finish.</p>
      <p>{check?.attempts ? 'Next level' : 'Starting level'} <strong>{DIFFICULTY_LABELS[level]}</strong></p>
      {trial ? <button type="button" className="button primary" onClick={() => {
        roomStore.select(trial.id)
        void navigate({ to: '/' })
      }}>Resume difficulty check</button> : <>
        <details className="difficulty-check-techniques" open={focus ? true : undefined}>
          <summary>Choose techniques</summary>
          <p>Mark techniques you can use on your own and techniques you’d like to see in a puzzle.</p>
          <p>The check can look for a puzzle that uses singles, your comfortable techniques, and one practice technique that fits the level.</p>
          <div className="difficulty-check-profile">
            <span>Technique</span><span>Comfortable with</span><span>Want to practice</span>
            {DIFFICULTY_LEVELS.map(difficulty => <details key={difficulty} open={difficulty === level ? true : undefined}>
              <summary>{DIFFICULTY_LABELS[difficulty]}</summary>
              {topics.filter(topic => PRACTICE_TOPICS[topic].difficulty === difficulty).map(topic => {
                const { name } = PRACTICE_TOPICS[topic]
                return <div className="difficulty-check-technique" key={topic}>
                  <span>{name}</span>
                  <label><input type="checkbox" aria-label={`Comfortable with ${name}`} disabled={busy}
                    checked={profile.comfortable.includes(topic)} onChange={event => setTechnique(topic, 'comfortable', event.target.checked)} /></label>
                  <label><input type="checkbox" aria-label={`Want to practice ${name}`} disabled={busy}
                    checked={profile.practice.includes(topic)} onChange={event => setTechnique(topic, 'practice', event.target.checked)} /></label>
                </div>
              })}
            </details>)}
          </div>
          {profile.practice.length > 0 && <div className="difficulty-check-actions">
            {profile.practice.filter(isPracticeTopic).map(topic =>
              <Link className="button quiet" key={topic} to="/learn/practice" search={{ technique: topic }}>Practice {PRACTICE_TOPICS[topic].name}</Link>)}
          </div>}
        </details>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="difficulty-check-actions">
          <button type="button" className="button primary" disabled={busy} onClick={() => void start()}>
            {busy ? 'Generating…' : check?.attempts ? 'Try next puzzle' : 'Start difficulty check'}
          </button>
          {canFallback && <button type="button" className="button secondary" onClick={() => void start(true)}>Try this level without technique preferences</button>}
        </div>
      </>}
      {check && <button type="button" className="button quiet" disabled={busy} onClick={() => {
        difficultyCheckStore.close()
        setError('')
        setCanFallback(false)
      }}>End difficulty check</button>}
    </>}
  </main>
}
