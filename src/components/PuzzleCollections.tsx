import '../collections.css'
import { useId, useState } from 'react'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { BookOpen, Bookmark, Check, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import {
  COLLECTIONS, collectionDifficulties, collectionProgress, collectionPuzzles, collectionPuzzleStatus, findCollectionGame, getCollection,
  getGameCollection, type CollectionPuzzle, type PuzzleCollection,
} from '../sudoku/collections'
import { openCollectionPuzzle } from '../sudoku/collection-play'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { isSolved, type Game } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'

const route = getRouteApi('/puzzles/collections')
const statusLabels = { unplayed: 'Not started', 'in-progress': 'In progress', solved: 'Solved' }

function difficultyLabel(puzzle: CollectionPuzzle) {
  return puzzle.difficulty ? DIFFICULTY_LABELS[puzzle.difficulty] : 'Unrated'
}

export function CollectionCredits({ collection }: { collection: PuzzleCollection }) {
  return <div className="collection-credits">
    <p>Puzzles by <a href={collection.sourceUrl} target="_blank" rel="noreferrer">{collection.creator}</a>.
      {' '}<a href={collection.licenseUrl} target="_blank" rel="noreferrer">{collection.license}</a>.</p>
    <p>{collection.changes}</p>
  </div>
}

export function PuzzleCollectionCredit({ game }: { game: Game }) {
  const entry = getGameCollection(game)
  if (!entry) return null
  return <div className="puzzle-collection-credit">
    <Link to="/puzzles/collections" search={{ collection: entry.collection.id, difficulty: entry.puzzle.difficulty ?? undefined, puzzle: entry.puzzle.id }}>
      <BookOpen size={14} aria-hidden="true" /> {entry.collection.title}
    </Link>
    <span>By {entry.collection.creator}</span>
    <a href={entry.collection.licenseUrl} target="_blank" rel="noreferrer">{entry.collection.license}</a>
  </div>
}

export function PuzzleCollections({ games, onPlay }: { games: Game[]; onPlay: () => void }) {
  const search = route.useSearch()
  const navigate = useNavigate()
  const id = useId()
  const [message, setMessage] = useState('')
  const collection = getCollection(search.collection)
  const puzzle = collection?.puzzles.find(puzzle => puzzle.id === search.puzzle)
  const difficulties = collection ? collectionDifficulties(collection) : []
  const difficulty = puzzle?.difficulty ?? (search.difficulty && difficulties.includes(search.difficulty) ? search.difficulty : undefined)

  function open(puzzleId: string, play: boolean) {
    if (!collection) return
    try {
      const { added } = openCollectionPuzzle(collection.id, puzzleId, play)
      if (play) onPlay()
      else setMessage(!roomStore.getSnapshot().storageAvailable
        ? 'Puzzle available for this session. Local storage is unavailable.'
        : added ? 'Puzzle saved for later.' : 'This puzzle is already in Your puzzles.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'This puzzle could not be opened.')
    }
  }

  if (search.collection && !collection || search.puzzle && !puzzle) return <section className="main-menu-section">
    <p>This collection or puzzle could not be found.</p>
    <Link to="/puzzles/collections" search={{}} className="button secondary">Browse collections</Link>
  </section>

  if (!collection) return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
    <header><h2 id={`${id}-title`}>Puzzle collections</h2><p>Explore a set at your own pace. Each puzzle keeps your progress on this device.</p></header>
    <div className="collection-cards">
      {COLLECTIONS.map(collection => {
        const progress = collectionProgress(collection, games)
        return <Link key={collection.id} className="collection-card" to="/puzzles/collections" search={{ collection: collection.id }}>
          <span className="collection-card-icon"><BookOpen size={24} aria-hidden="true" /></span>
          <span className="collection-card-count">{collection.puzzles.length} classic puzzles</span>
          <h3>{collection.title}</h3>
          <p>{collection.description}</p>
          <progress value={progress.solved} max={collection.puzzles.length} aria-label={`${collection.title}: ${progress.solved} solved`} />
          <span className="collection-card-footer"><span>{progress.solved} of {collection.puzzles.length} solved</span><ChevronRight size={18} aria-hidden="true" /></span>
        </Link>
      })}
    </div>
    <p className="collection-note">Collections are available offline after the app finishes its first download.</p>
    <Link to="/puzzles/new" search={{}} className="collection-generate-link">Generate a new puzzle <ChevronRight size={16} aria-hidden="true" /></Link>
  </section>

  if (!difficulty) return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
    <Link className="collection-back" to="/puzzles/collections" search={{}}><ChevronLeft size={16} aria-hidden="true" /> All collections</Link>
    <header><h2 id={`${id}-title`}>Choose difficulty</h2><p>Choose a difficulty to start or continue {collection.title}.</p></header>
    <div className="collection-difficulty-cards">
      {difficulties.map(difficulty => {
        const puzzles = collectionPuzzles(collection, difficulty)
        const progress = collectionProgress(collection, games, difficulty)
        const label = DIFFICULTY_LABELS[difficulty]
        return <Link key={difficulty} className="collection-difficulty-card" to="/puzzles/collections" search={{ collection: collection.id, difficulty }}>
          <strong>{label}</strong><span>{puzzles.length} puzzles</span>
          <progress value={progress.solved} max={puzzles.length} aria-label={`${label}: ${progress.solved} of ${puzzles.length} solved`} />
          <small>{progress.solved} of {puzzles.length} solved</small><ChevronRight size={18} aria-hidden="true" />
        </Link>
      })}
    </div>
    <CollectionCredits collection={collection} />
  </section>

  const groupSearch = { ...search, collection: collection.id, difficulty, puzzle: undefined }
  if (puzzle) {
    const existing = findCollectionGame(puzzle, games)
    const solved = existing && isSolved(existing)
    return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
      <Link className="collection-back" to="/puzzles/collections" search={groupSearch}>
        <ChevronLeft size={16} aria-hidden="true" /> Back to {DIFFICULTY_LABELS[difficulty].toLowerCase()} puzzles
      </Link>
      <header><h2 id={`${id}-title`}>{puzzle.title}</h2><p>{collection.title} · {difficultyLabel(puzzle)} · Classic</p></header>
      <div className="collection-puzzle-preview">
        <Board label="Collection puzzle preview" givens={puzzle.givens} values={puzzle.givens} showGuides={false} />
        <div className="collection-preview-actions">
          <button type="button" className="button primary" onClick={() => open(puzzle.id, true)}>
            <Play size={17} aria-hidden="true" /> {solved ? 'Review puzzle' : existing?.started ? 'Resume puzzle' : 'Start puzzle'}
          </button>
          {!existing && <button type="button" className="button secondary" onClick={() => open(puzzle.id, false)}>
            <Bookmark size={17} aria-hidden="true" /> Save for later
          </button>}
          {existing && <p className="collection-note">{solved ? 'You solved this puzzle.' : existing.savedForLater
            ? 'Saved in Your puzzles.' : 'Your progress is saved in Your puzzles.'}</p>}
        </div>
      </div>
      {message && <p role="status" className="dialog-status">{message}</p>}
      <CollectionCredits collection={collection} />
    </section>
  }

  const progress = collectionProgress(collection, games, difficulty)
  const difficultyPuzzles = collectionPuzzles(collection, difficulty)
  const puzzles = difficultyPuzzles.filter(puzzle => !search.status || collectionPuzzleStatus(puzzle, games) === search.status)
  const next = puzzles.find(puzzle => collectionPuzzleStatus(puzzle, games) === 'in-progress')
    ?? puzzles.find(puzzle => collectionPuzzleStatus(puzzle, games) === 'unplayed')

  return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
    <Link className="collection-back" to="/puzzles/collections" search={{ collection: collection.id }}><ChevronLeft size={16} aria-hidden="true" /> Change difficulty</Link>
    <header><h2 id={`${id}-title`}>{DIFFICULTY_LABELS[difficulty]} puzzles</h2><p>{collection.title}</p></header>
    <div className="collection-summary">
      <div><strong>{progress.solved} of {difficultyPuzzles.length} solved</strong>
        <progress value={progress.solved} max={difficultyPuzzles.length} aria-label={`${DIFFICULTY_LABELS[difficulty]} completion`} /></div>
      {next ? <button type="button" onClick={() => open(next.id, true)} className="button primary">
        <Play size={16} aria-hidden="true" /> {collectionPuzzleStatus(next, games) === 'in-progress' ? 'Continue collection' : 'Play next puzzle'}
      </button> : progress.solved === difficultyPuzzles.length && <span className="collection-complete"><Check size={18} aria-hidden="true" /> Difficulty complete</span>}
    </div>
    {message && <p role="status" className="dialog-status">{message}</p>}
    <div className="collection-filters">
      <label>Progress<select value={search.status ?? ''} onChange={event => {
        const status = event.target.value as keyof typeof statusLabels | ''
        void navigate({ to: '/puzzles/collections', search: { ...groupSearch, status: status || undefined }, replace: true })
      }}>
        <option value="">All puzzles</option>
        {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
    </div>
    <p className="collection-note" role="status">{puzzles.length} {puzzles.length === 1 ? 'puzzle' : 'puzzles'}</p>
    {puzzles.length ? <ol className="collection-puzzle-list">
      {puzzles.map(puzzle => {
        const status = collectionPuzzleStatus(puzzle, games)
        const existing = findCollectionGame(puzzle, games)
        const number = difficultyPuzzles.indexOf(puzzle) + 1
        return <li key={puzzle.id}>
          <Link to="/puzzles/collections" search={{ ...groupSearch, puzzle: puzzle.id }}>
            <span className="collection-puzzle-number">{String(number).padStart(2, '0')}</span>
            <span className="collection-puzzle-copy"><strong>{puzzle.title}</strong><small>{difficultyLabel(puzzle)} · {existing?.savedForLater ? 'Saved for later' : statusLabels[status]}</small></span>
            {status === 'solved' ? <Check size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
          </Link>
        </li>
      })}
    </ol> : <div className="collection-empty"><p>No puzzles match these filters.</p>
      <Link to="/puzzles/collections" search={{ collection: collection.id, difficulty }}>Clear filters</Link></div>}
    <CollectionCredits collection={collection} />
  </section>
}
