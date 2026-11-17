import '../collections.css'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { BookOpen, Bookmark, Check, ChevronLeft, ChevronRight, Download, Play } from 'lucide-react'
import {
  COLLECTIONS, collectionDifficulties, collectionProgress, collectionPuzzles, collectionPuzzleStatus,
  discoverCollections, findCollectionGame, getCollection, getGameCollection, nextCollectionPuzzle, type CollectionPuzzleInfo, type PuzzleCollection,
} from '../sudoku/collections'
import { collectionDownloadBytes, collectionDownloads, formatCollectionBytes } from '../sudoku/collection-downloads'
import { openCollectionPuzzle } from '../sudoku/collection-play'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import { isSolved, type Game } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Modal } from './Modal'

const route = getRouteApi('/puzzles/collections')
const statusLabels = { unplayed: 'Not started', 'in-progress': 'In progress', solved: 'Solved' }
const dataSize = (puzzles: readonly CollectionPuzzleInfo[]) => formatCollectionBytes(collectionDownloadBytes(puzzles))

function DownloadPuzzles({ collection, puzzles, games }: { collection: PuzzleCollection; puzzles: readonly CollectionPuzzleInfo[]; games: Game[] }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const count = Number(quantity)
  const valid = Number.isSafeInteger(count) && count >= 1 && count <= puzzles.length
  const selected = valid ? puzzles.slice(0, count) : []

  function close() {
    controller.current?.abort()
    setOpen(false)
  }

  async function download() {
    if (!valid || controller.current) return
    const current = new AbortController()
    controller.current = current
    setMessage('')
    setError('')
    try {
      const added = await collectionDownloads.download(collection, selected, {
        games, signal: current.signal, onProgress: (done, total) => setProgress({ done, total }),
      })
      setMessage(added === 0 ? 'These puzzles are already available offline.'
        : `${added} ${added === 1 ? 'puzzle is' : 'puzzles are'} ready for offline play.`)
      setOpen(false)
    } catch (reason) {
      if (!current.signal.aborted) setError(reason instanceof Error ? reason.message : 'The download failed. Try again.')
    } finally {
      controller.current = null
      setProgress(null)
    }
  }

  return <div className="collection-download-action">
    {puzzles.length > 0 && <button type="button" className="button secondary" aria-haspopup="dialog" disabled={!!progress} onClick={() => {
      setQuantity(String(Math.min(10, puzzles.length)))
      setError('')
      setOpen(true)
    }}>Download</button>}
    <span className="sr-only" role="status">{message}</span>
    {open && createPortal(<Modal title="Download puzzles" onClose={close}>
      <form className="dialog-form" onSubmit={event => { event.preventDefault(); void download() }}>
        <label htmlFor={`${id}-count`}>Number of puzzles ({puzzles.length} available)</label>
        <div className="collection-download-quantity">
          <input id={`${id}-count`} type="number" inputMode="numeric" min={1} max={puzzles.length} step={1}
            value={quantity} disabled={!!progress} autoFocus onChange={event => setQuantity(event.target.value)} />
          {puzzles.length > 1 && <button type="button" className="button secondary" disabled={!!progress}
            onClick={() => setQuantity(String(puzzles.length))}>All {puzzles.length}</button>}
        </div>
        <p aria-live="polite">{progress ? `Downloading ${progress.done} of ${progress.total}…`
          : valid ? `${dataSize(selected)} of puzzle data for offline play` : `Choose a whole number from 1 to ${puzzles.length}.`}</p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={close}>Cancel</button>
          <button type="submit" className="button primary" disabled={!valid || !!progress}>
            <Download size={17} aria-hidden="true" /> Download
          </button>
        </div>
      </form>
    </Modal>, document.body)}
  </div>
}

function difficultyLabel(puzzle: CollectionPuzzleInfo) {
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
  const downloads = useSyncExternalStore(collectionDownloads.subscribe, collectionDownloads.getSnapshot, collectionDownloads.getServerSnapshot)
  const downloadedCollections = new Set(Object.keys(downloads).filter(id => Object.keys(downloads[id]).length))
  const collection = getCollection(search.collection)
  const puzzle = collection?.puzzles.find(puzzle => puzzle.id === search.puzzle)
  const difficulties = collection ? collectionDifficulties(collection) : []
  const difficulty = puzzle?.difficulty ?? (search.difficulty && difficulties.includes(search.difficulty) ? search.difficulty : undefined)
  const grids = collection ? collectionDownloads.grids(collection, games) : {}

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
    <header><h2 id={`${id}-title`}>Puzzle collections</h2><p>Choose a collection, then download as many puzzles as you want for offline play.</p></header>
    <div className="collection-cards">
      {discoverCollections(games, search.view === 'all', downloadedCollections).map(collection => {
        const downloaded = Object.keys(collectionDownloads.grids(collection, games)).length
        return <Link key={collection.id} className="collection-card" to="/puzzles/collections" search={{ collection: collection.id }}>
          <span className="collection-card-icon"><BookOpen size={24} aria-hidden="true" /></span>
          <span className="collection-card-count">{collection.kind === 'handmade' ? 'Handmade' : 'Generated'} · {collection.puzzles.length} puzzles · {dataSize(collection.puzzles)}</span>
          <h3>{collection.title}</h3><p>{collection.description}</p>
          <span className="collection-card-footer"><span>{downloaded} available offline</span><ChevronRight size={18} aria-hidden="true" /></span>
        </Link>
      })}
    </div>
    {(search.view === 'all' || discoverCollections(games, false, downloadedCollections).length < COLLECTIONS.length) && <Link to="/puzzles/collections"
      search={{ view: search.view === 'all' ? undefined : 'all' }} className="collection-generate-link">
      {search.view === 'all' ? 'Back to handmade collections' : 'Browse all collections'} <ChevronRight size={16} aria-hidden="true" />
    </Link>}
    <p className="collection-note">No collection puzzles download automatically. Sizes show puzzle data.</p>
    <Link to="/puzzles/new" search={{}} className="collection-generate-link">Generate a new puzzle <ChevronRight size={16} aria-hidden="true" /></Link>
  </section>

  if (!difficulty) return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
    <Link className="collection-back" to="/puzzles/collections" search={{}}><ChevronLeft size={16} aria-hidden="true" /> All collections</Link>
    <header><h2 id={`${id}-title`}>Choose difficulty</h2><p>{collection.title} · {Object.keys(grids).length} available offline</p></header>
    <div className="collection-difficulty-cards">
      {difficulties.map(difficulty => {
        const puzzles = collectionPuzzles(collection, difficulty)
        const downloaded = puzzles.filter(puzzle => grids[puzzle.id]).length
        const label = DIFFICULTY_LABELS[difficulty]
        return <Link key={difficulty} className="collection-difficulty-card" to="/puzzles/collections" search={{ collection: collection.id, difficulty }}>
          <strong>{label}</strong><span>{puzzles.length} puzzles</span>
          <small>{downloaded} offline · {dataSize(puzzles)} for all</small><ChevronRight size={18} aria-hidden="true" />
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
      {grids[puzzle.id] ? <div className="collection-puzzle-preview">
        <Board label="Collection puzzle preview" givens={grids[puzzle.id]} values={grids[puzzle.id]} showGuides={false} />
        <div className="collection-preview-actions">
          <button type="button" className="button primary" onClick={() => open(puzzle.id, true)}>
            <Play size={17} aria-hidden="true" /> {solved ? 'Review puzzle' : existing?.started ? 'Resume puzzle' : 'Start puzzle'}
          </button>
          {!existing && <button type="button" className="button secondary" onClick={() => open(puzzle.id, false)}>
            <Bookmark size={17} aria-hidden="true" /> Save for later
          </button>}
          <p className="collection-note">{solved ? 'You solved this puzzle.' : 'Available offline on this device.'}</p>
        </div>
      </div> : <DownloadPuzzles collection={collection} puzzles={[puzzle]} games={games} />}
      {message && <p role="status" className="dialog-status">{message}</p>}
      <CollectionCredits collection={collection} />
    </section>
  }

  const progress = collectionProgress(collection, games, difficulty)
  const all = collectionPuzzles(collection, difficulty)
  const downloaded = all.filter(puzzle => grids[puzzle.id])
  const remaining = all.filter(puzzle => !grids[puzzle.id])
  const puzzles = downloaded.filter(puzzle => !search.status || collectionPuzzleStatus(puzzle, games) === search.status)
  const next = nextCollectionPuzzle(collection, games, difficulty, undefined, new Set(Object.keys(grids)))

  return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
    <Link className="collection-back" to="/puzzles/collections" search={{ collection: collection.id }}><ChevronLeft size={16} aria-hidden="true" /> Change difficulty</Link>
    <header className="collection-list-header">
      <div><h2 id={`${id}-title`}>{DIFFICULTY_LABELS[difficulty]} puzzles</h2><p>{collection.title} · {downloaded.length} available offline</p></div>
      <DownloadPuzzles collection={collection} puzzles={remaining} games={games} />
    </header>
    {downloaded.length > 0 && <div className="collection-summary">
      <div><strong>{progress.solved} of {downloaded.length} solved</strong>
        <progress value={progress.solved} max={downloaded.length} aria-label={`${DIFFICULTY_LABELS[difficulty]} downloaded puzzles completion`} /></div>
      {next ? <button type="button" onClick={() => open(next.id, true)} className="button primary">
        <Play size={16} aria-hidden="true" /> {collectionPuzzleStatus(next, games) === 'in-progress' ? 'Continue collection' : 'Play next puzzle'}
      </button> : <span className="collection-complete"><Check size={18} aria-hidden="true" /> {remaining.length ? 'Downloaded puzzles complete' : 'Difficulty complete'}</span>}
    </div>}
    {message && <p role="status" className="dialog-status">{message}</p>}
    {downloaded.length > 0 && <div className="collection-filters">
      <label>Progress<select value={search.status ?? ''} onChange={event => {
        const status = event.target.value as keyof typeof statusLabels | ''
        void navigate({ to: '/puzzles/collections', search: { ...groupSearch, status: status || undefined }, replace: true })
      }}>
        <option value="">All downloaded puzzles</option>
        {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
    </div>}
    {puzzles.length ? <ol className="collection-puzzle-list">
      {puzzles.map(puzzle => {
        const status = collectionPuzzleStatus(puzzle, games)
        const existing = findCollectionGame(puzzle, games)
        return <li key={puzzle.id}>
          <Link to="/puzzles/collections" search={{ ...groupSearch, puzzle: puzzle.id }}>
            <span className="collection-puzzle-copy"><strong>{puzzle.title}</strong><small>{existing?.savedForLater ? 'Saved for later' : statusLabels[status]}</small></span>
            {status === 'solved' ? <Check size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
          </Link>
        </li>
      })}
    </ol> : <div className="collection-empty"><p>{downloaded.length ? 'No downloaded puzzles match this filter.' : 'No puzzles downloaded at this difficulty.'}</p>
      {search.status && <Link to="/puzzles/collections" search={{ collection: collection.id, difficulty }}>Clear filters</Link>}</div>}
    <CollectionCredits collection={collection} />
  </section>
}
