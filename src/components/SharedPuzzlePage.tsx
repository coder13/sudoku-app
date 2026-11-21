import { fogView } from '../sudoku/fog'
import { Link } from '@tanstack/react-router'
import { Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Game } from '../sudoku/game'
import { ALGEBRAIC_CAGES_NAME, sizedGridName } from '../sudoku/new-puzzle'
import { sizedRuleDescriptions } from '../sudoku/sized-rule-game'
import { algebraicRules } from '../sudoku/algebraic-play'
import { prepareSharedPuzzle, type PuzzlePreview } from '../sudoku/puzzle-preview'
import { findSharedAttempt, isSharedPuzzleId } from '../sudoku/puzzle-sharing'
import { roomStore } from '../sudoku/storage'
import { variantName, variantRuleDescriptions } from '../sudoku/variants'
import { Board } from './Board'
import { Button, buttonClassName } from './Button'
import { finishImport } from './ImportPuzzle'
import { PuzzleCollectionCredit } from './PuzzleCollections'

export function SharedPuzzlePage({ id, games, linked, syncReady }: {
  id: string; games: readonly Game[]; linked: boolean; syncReady: boolean
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  const [preview, setPreview] = useState<PuzzlePreview>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const existing = findSharedAttempt(games, id)
  const hasCopy = Boolean(existing)
  const valid = isSharedPuzzleId(id)

  useEffect(() => {
    if (!valid || hasCopy) return
    const request = new AbortController()
    setError('')
    void prepareSharedPuzzle(id, roomStore.getSnapshot().games, request.signal).then(result => {
      if (!request.signal.aborted) setPreview(result)
    }).catch(reason => {
      if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : 'This puzzle could not be opened.')
    })
    return () => request.abort()
  }, [id, attempt, hasCopy, valid])

  const puzzle = existing ?? preview?.game
  const fog = fogView(puzzle?.variant)
  const holdingForSync = linked && !syncReady && !existing
  const failure = valid ? error : 'This puzzle link is invalid.'
  return <main className="page sync-page shared-puzzle-page">
    <h1 tabIndex={-1} ref={heading}>{puzzle?.title ?? (failure ? 'Shared puzzle unavailable' : 'Shared puzzle')}</h1>
    {puzzle ? <>
      <div className="import-preview">
        <p className="import-preview-meta"><strong>{puzzle.algebraic ? `${ALGEBRAIC_CAGES_NAME} · 4 × 4`
          : puzzle.grid?.size === 4 ? 'Mini Sudoku · 4 × 4'
            : puzzle.grid ? sizedGridName(puzzle.grid) : variantName(puzzle.variant)}</strong></p>
        <Board grid={puzzle.grid} whispersGuide={puzzle.whispersGuide} label="Puzzle preview" givens={puzzle.givens} values={puzzle.givens}
          variantPuzzle={puzzle.variant?.puzzle} fog={fog} algebraicCages={puzzle.algebraic?.rules} sizedRules={puzzle.sized?.rules} showGuides={false} />
        {puzzle.algebraic && <>
          {puzzle.algebraic.source?.author && <p>By {puzzle.algebraic.source.author}</p>}
          <ul className="import-preview-rules">
            {algebraicRules(puzzle.algebraic).map(rule => <li key={rule}>{rule}</li>)}
          </ul>
        </>}
        {puzzle.sized?.author && <p>By {puzzle.sized.author}</p>}
        {puzzle.sized && puzzle.grid && <ul className="import-preview-rules">
          {sizedRuleDescriptions(puzzle.grid, puzzle.sized.rules).map(rule => <li key={rule}>{rule}</li>)}
        </ul>}
        {puzzle.variant && <ul className="import-preview-rules">
          {variantRuleDescriptions(fog?.puzzle ?? puzzle.variant.puzzle, puzzle.variant.fog).map(rule => <li key={rule}>{rule}</li>)}
        </ul>}
        <PuzzleCollectionCredit game={puzzle} />
      </div>
      <p>{existing ? 'You already have a copy of this puzzle.' : linked
        ? 'Your copy will be saved to your linked library.' : 'Your copy will be saved in this browser.'}</p>
      <div className="dialog-actions">
        <Button variant="primary" disabled={holdingForSync} onClick={() => {
          if (existing) roomStore.select(existing.id)
          else if (preview) finishImport(preview, true)
        }}><Play size={17} aria-hidden="true" /> {existing ? 'Resume puzzle' : holdingForSync ? 'Checking your library…' : 'Start puzzle'}</Button>
        <Link className={buttonClassName()} to="/puzzles/browse">Your puzzles</Link>
      </div>
    </> : failure ? <>
      <p role="alert">{failure}</p>
      <div className="dialog-actions">
        {valid && <Button variant="primary" onClick={() => { setError(''); setAttempt(current => current + 1) }}>Try again</Button>}
        <Link className={buttonClassName()} to="/puzzles/browse">Your puzzles</Link>
      </div>
    </> : <p role="status">Opening puzzle…</p>}
  </main>
}
