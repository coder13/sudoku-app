import { Link, useRouter } from '@tanstack/react-router'
import { Calculator, ChevronRight, Hash, MoveHorizontal, Route as PathIcon, Sigma } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { numberPuzzleDifficulties, numberPuzzleDifficultyLabels, type NumberPuzzleDifficulty, type NumberPuzzleEntry } from '../number-puzzles/catalog'
import { recordDifficultySolve, summarizeDifficultySolves, type DifficultyStatistics, type DifficultyTotals } from '../sudoku/difficulty-statistics'
import { generatedNumberHistory, numberPositionKey } from '../number-puzzles/generated-storage'
import { hasNumberMoves, loadNumberDifficulty, parseNumberProgress, readNumberProgress, rememberNumberDifficulty, type SavedNumberProgress } from '../number-puzzles/progress'
import { buttonClassName } from './Button'
import { DifficultyOptions, PuzzleDifficultyStep } from './DifficultySelector'
import { PuzzlesSectionNav } from './PuzzlesSectionNav'
import { useNumberPuzzleGeneration } from './useNumberPuzzleGeneration'
import { NumberGameHeading } from './NumberPuzzleHeading'
import { boardPosition, editableCells, puzzleDestination } from './NumberPuzzleModel'
import type { NumberGame, NumberGameConfig, NumberBoard } from './NumberPuzzleTypes'

type ProgressStatus = 'started' | 'solved'
type NumberDifficultyResults = {
  active: NumberPuzzleEntry[]
  statistics: ReadonlyMap<NumberPuzzleDifficulty, DifficultyStatistics>
}

function readDifficultyProgress(board: NumberBoard, saved: SavedNumberProgress, difficulty: NumberPuzzleDifficulty,
  totals: DifficultyTotals<NumberPuzzleDifficulty>): ProgressStatus | null {
  const progress = parseNumberProgress(saved, editableCells(board), board.maxValue)
  if (!progress || !hasNumberMoves(progress)) return null
  if (!board.check(progress.position.values).complete) return 'started'
  recordDifficultySolve(totals, difficulty, progress.clock === 'untimed' ? undefined : progress.clock?.elapsed)
  return 'solved'
}

const resumeBatchSize = 24

function NumberResumeList({ game, entries }: { game: NumberGame; entries: readonly NumberPuzzleEntry[] }) {
  const [visible, setVisible] = useState(resumeBatchSize)
  const rows = useMemo(() => entries.map(entry => <li key={entry.id}>
    <Link className="game-row" {...puzzleDestination(game, entry)} state={{ fromNumberDifficulty: game }}>
      <span className="game-row-copy"><strong>{numberPuzzleDifficultyLabels[entry.difficulty]} {entry.number}</strong>
        {entry.generated && <small>Generated puzzle</small>}</span>
      <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
    </Link>
  </li>), [entries, game])

  useEffect(() => {
    if (visible >= rows.length) return
    // Add the next set of links after the browser can paint and handle input.
    const frame = window.requestAnimationFrame(() => setVisible(visible + resumeBatchSize))
    return () => window.cancelAnimationFrame(frame)
  }, [visible, rows.length])

  return <section className="number-puzzle-resume new-puzzle-step" aria-labelledby="number-puzzle-resume-title">
    <h2 id="number-puzzle-resume-title">In progress</h2>
    <ul className="game-list main-puzzle-list">{rows.slice(0, visible)}</ul>
  </section>
}

/** Use for the difficulty and resume page of a standalone number puzzle. */
export function NumberGameDifficulty<Entry extends NumberPuzzleEntry>({ config }: { config: NumberGameConfig<Entry> }) {
  const { entries, game, name, generatedEntry } = config
  const router = useRouter()
  const levels = numberPuzzleDifficulties.filter(level => entries.some(entry => entry.difficulty === level))
  const [difficulty, setDifficulty] = useState<NumberPuzzleDifficulty>(levels[0])
  const generation = useNumberPuzzleGeneration(generatedEntry ? game : null)
  const [catalogProgress, setCatalogProgress] = useState<ReadonlyMap<string, ProgressStatus> | null>(null)
  const [results, setResults] = useState<NumberDifficultyResults | null>(null)

  useEffect(() => {
    const catalog = new Map<string, ProgressStatus>()
    const totals: DifficultyTotals<NumberPuzzleDifficulty> = new Map()
    for (const entry of entries) {
      const saved = readNumberProgress(numberPositionKey(game, entry.id))
      const status = saved && readDifficultyProgress(config.board(entry), saved, entry.difficulty, totals)
      if (status) catalog.set(entry.id, status)
    }
    const savedDifficulty = loadNumberDifficulty(game)
    if (savedDifficulty && entries.some(entry => entry.difficulty === savedDifficulty)) setDifficulty(savedDifficulty)
    setCatalogProgress(catalog)

    const generated: NumberPuzzleEntry[] = []
    const finish = () => setResults({ active: generated, statistics: summarizeDifficultySolves(totals) })
    if (!generatedEntry) {
      finish()
      return
    }

    setResults(null)
    let history: Awaited<ReturnType<typeof generatedNumberHistory>> = []
    let cursor = 0
    let active = true
    const queue = new MessageChannel()
    const closeQueue = () => {
      queue.port1.close()
      queue.port2.close()
    }
    const readBatch = () => {
      const deadline = performance.now() + 6
      do {
        const { id, number, progress } = history[cursor++]
        if (!progress) continue
        const entry = generatedEntry(id, number)
        if (!entry) continue
        const { difficulty } = entry
        const status = readDifficultyProgress(config.board(entry), progress, difficulty, totals)
        if (status === 'started') generated.push({ id, difficulty, number, generated: true })
      } while (cursor < history.length && performance.now() < deadline)

      if (cursor < history.length) queue.port2.postMessage(null)
      else {
        closeQueue()
        finish()
      }
    }
    // Allow the picker to paint before checking generated boards.
    queue.port1.onmessage = readBatch
    const frame = window.requestAnimationFrame(() => {
      void generatedNumberHistory(game).then(records => {
        if (!active) return
        history = records
        if (history.length) queue.port2.postMessage(null)
        else {
          closeQueue()
          finish()
        }
      })
    })
    return () => {
      active = false
      window.cancelAnimationFrame(frame)
      closeQueue()
    }
  }, [config, entries, game, generatedEntry])

  const ready = catalogProgress !== null
  const active = useMemo(() => [
    ...entries.filter(entry => catalogProgress?.get(entry.id) === 'started'),
    ...(results?.active ?? []),
  ], [entries, catalogProgress, results])
  const statistics = results?.statistics ?? null
  const group = entries.filter(entry => entry.difficulty === difficulty)
  const next = group.find(entry => !catalogProgress?.has(entry.id))
    ?? group.find(entry => catalogProgress?.get(entry.id) === 'started') ?? group[0]
  const busy = generation.pending !== null
  const GameIcon = { kakuro: Hash, calcudoku: Calculator, futoshiki: MoveHorizontal, hidato: PathIcon, rullo: Sigma }[game]

  function start() {
    if (generatedEntry) generation.generate(difficulty)
    else if (next) {
      rememberNumberDifficulty(game, difficulty)
      void router.navigate({ ...puzzleDestination(game, next), state: { fromNumberDifficulty: game } })
    }
  }

  return <main className="puzzles-page puzzles-subscreen new-puzzle-page puzzles-difficulty-page">
    <div className="puzzles-layout">
      <NumberGameHeading game={game} title="Choose difficulty" />
      <PuzzlesSectionNav active="new" />
      <div className="main-menu-panel motion-screen">
        <PuzzleDifficultyStep name={name}
          preview={<span className="variant-preview number-difficulty-preview" aria-hidden="true"><GameIcon size={28} /></span>}
          busy={busy} disabled={!ready} error={generation.error} onStart={start}
          startLabel={`Start ${numberPuzzleDifficultyLabels[difficulty].toLowerCase()} puzzle`}
          actions={generatedEntry && next && <Link className={buttonClassName('quiet')}
            {...puzzleDestination(game, next)} state={{ fromNumberDifficulty: game }}
            onClick={event => {
              if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) rememberNumberDifficulty(game, difficulty)
            }}>Play a catalog puzzle</Link>}>
          <DifficultyOptions levels={levels} selected={difficulty} onChange={setDifficulty} disabled={busy || !ready} statistics={statistics} />
        </PuzzleDifficultyStep>
        {active.length > 0 && <NumberResumeList game={game} entries={active} />}
      </div>
    </div>
  </main>
}
