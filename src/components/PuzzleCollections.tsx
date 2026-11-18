import '../collections.css'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from '@tanstack/react-router'
import type { CollectionSearch } from '../routes/puzzles.collections'
import { BookOpen, Bookmark, Check, ChevronLeft, ChevronRight, Download, Play } from 'lucide-react'
import {
  COLLECTIONS, COLLECTION_VARIANTS, collectionDifficulties, collectionProgress, collectionPuzzles, collectionPuzzleStatus, collectionPuzzleSource,
  findCollectionGame, getCollection, getGameCollection, nextCollectionPuzzle, type CollectionPuzzleInfo, type PuzzleCollection,
  type CollectionVariant,
} from '../sudoku/collections'
import { collectionDownloadBytes, collectionDownloads, fetchCollectionGrid, formatCollectionBytes } from '../sudoku/collection-downloads'
import { openCollectionPuzzle } from '../sudoku/collection-play'
import { decodeCollectionData } from '../sudoku/collection-data'
import { DIFFICULTY_LABELS } from '../sudoku/difficulty'
import type { Difficulty } from '../sudoku/engine'
import { isSolved, type Game } from '../sudoku/game'
import { roomStore } from '../sudoku/storage'
import { Board } from './Board'
import { Modal } from './Modal'
import { SelectControl } from './SelectControl'
import { useOnlineStatus } from './useOnlineStatus'
import { VariantPreview } from './VariantSelector'
import { variantRuleDescriptions } from '../sudoku/variants'
import { libraryFamily, libraryLevel } from '../sudoku/sinclair-catalog'
import { sinclairDownloads } from '../sudoku/sinclair-download'

const variantDescriptions: Record<CollectionVariant, string> = {
  classic: 'Rows, columns, and 3 × 3 boxes.',
  'killer-cages': 'Connected cages with totals and no repeated digits.',
  diagonal: 'Each long diagonal also contains the digits 1 through 9.',
  jigsaw: 'Nine irregular regions replace the boxes.',
  kropki: 'White and black dots connect related digits.',
  windoku: 'Four shaded regions also contain the digits 1 through 9.',
  'anti-knight': 'Cells a knight can move between contain different digits.',
  thermometer: 'Digits increase from each bulb to its tip.',
  arrow: 'The digits on an arrow add to the digit in its circle.',
}

function CollectionSteps({ variant, collection, difficulty }: {
  variant?: CollectionVariant; collection?: PuzzleCollection; difficulty?: Difficulty
}) {
  return <nav className="collection-steps" aria-label="Collection selection"><ol>
    <li>{variant ? <Link to="/puzzles/collections" search={{}}>{COLLECTION_VARIANTS[variant]}</Link>
      : <span aria-current="step">Variant</span>}</li>
    <li>{collection ? <Link to="/puzzles/collections" search={{ variant }}>{collection.title}</Link>
      : <span aria-current={variant ? 'step' : undefined}>Collection</span>}</li>
    <li>{difficulty ? <Link to="/puzzles/collections" search={{ variant, collection: collection?.id }}>{DIFFICULTY_LABELS[difficulty]}</Link>
      : <span aria-current={collection ? 'step' : undefined}>Difficulty</span>}</li>
  </ol></nav>
}

const statusLabels = { unplayed: 'Not started', 'in-progress': 'In progress', solved: 'Solved' }
const dataSize = (puzzles: readonly CollectionPuzzleInfo[]) => formatCollectionBytes(collectionDownloadBytes(puzzles))

function DownloadPuzzles({ collection, missing, difficulty, games }: {
  collection: PuzzleCollection; missing: readonly CollectionPuzzleInfo[]; difficulty?: Difficulty; games: Game[]
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [wholeCollection, setWholeCollection] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const atDifficulty = difficulty ? missing.filter(puzzle => puzzle.difficulty === difficulty) : missing
  const showScope = Boolean(difficulty && atDifficulty.length && atDifficulty.length < missing.length)
  const puzzles = showScope && !wholeCollection ? atDifficulty : missing
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
    {missing.length > 0 && <button type="button" className="button secondary" aria-haspopup="dialog" disabled={!!progress} onClick={() => {
      setWholeCollection(false)
      setQuantity(String(Math.min(10, showScope ? atDifficulty.length : missing.length)))
      setError('')
      setOpen(true)
    }}>Download</button>}
    <span className="sr-only" role="status">{message}</span>
    {open && createPortal(<Modal title="Download puzzles" onClose={close}>
      <form className="dialog-form" onSubmit={event => { event.preventDefault(); void download() }}>
        {showScope && difficulty && <>
          <label htmlFor={`${id}-scope`}>Download from</label>
          <SelectControl id={`${id}-scope`} value={wholeCollection ? 'all' : 'difficulty'} disabled={!!progress}
            onChange={event => {
              const all = event.target.value === 'all'
              setWholeCollection(all)
              setQuantity(String(all ? missing.length : Math.min(10, atDifficulty.length)))
            }}>
            <option value="difficulty">{DIFFICULTY_LABELS[difficulty]}</option>
            <option value="all">Entire collection</option>
          </SelectControl>
        </>}
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

function DownloadLibraryLevel({ collection, difficulty }: { collection: PuzzleCollection; difficulty?: Difficulty }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const family = libraryFamily(collection.id)
  if (!family || !difficulty) return null
  const level = libraryLevel(family, difficulty)
  if (sinclairDownloads.saved(level.url)) return <span className="collection-note">100 puzzles available offline</span>
  return <div className="collection-download-action">
    <button type="button" className="button secondary" disabled={busy} onClick={async () => {
      setBusy(true)
      setMessage('')
      try {
        await sinclairDownloads.saveOffline(family, difficulty)
      } catch (error) { setMessage((error as Error).message) }
      finally { setBusy(false) }
    }}>{busy ? 'Downloading…' : 'Download 100 puzzles'}</button>
    <small>{formatCollectionBytes(level.bytes)} of puzzle data</small>
    {message && <p role="status">{message}</p>}
  </div>
}

function difficultyLabel(puzzle: CollectionPuzzleInfo) {
  return puzzle.difficulty ? DIFFICULTY_LABELS[puzzle.difficulty] : 'Unrated'
}

export function CollectionCredits({ collection }: { collection: PuzzleCollection }) {
  return <div className="collection-credits">
    <p>Puzzles by <a href={collection.sourceUrl} target="_blank" rel="noreferrer">{collection.creator}</a>.
      {collection.licenseUrl && <> <a href={collection.licenseUrl} target="_blank" rel="noreferrer">{collection.license}</a>.</>}</p>
    <p>{collection.changes}</p>
  </div>
}

export function PuzzleCollectionCredit({ game }: { game: Game }) {
  const entry = getGameCollection(game)
  if (!entry) return null
  const { collection, puzzle } = entry
  // The catalog title preserves the printed code, including leading zeros.
  const puzzleNumber = puzzle.title.match(/(?:^|\s)([\w-]*\d[\w-]*)$/)?.[1]
  return <div className="puzzle-collection-credit">
    <Link to="/puzzles/collections" search={{ variant: collection.variant, collection: collection.id, difficulty: puzzle.difficulty ?? undefined, puzzle: puzzle.id }}>
      <BookOpen size={14} aria-hidden="true" /><span>{collection.title} · {puzzleNumber ?? puzzle.title}</span>
    </Link>
    <a href={collectionPuzzleSource(collection, puzzle)} target="_blank" rel="noreferrer">By {collection.creator}</a>
    {collection.licenseUrl && <a href={collection.licenseUrl} target="_blank" rel="noreferrer">{collection.license}</a>}
  </div>
}

export function PuzzleCollections({ games, onPlay, search }: { games: Game[]; onPlay: () => void; search: CollectionSearch }) {
  const navigate = useNavigate()
  const id = useId()
  const [message, setMessage] = useState('')
  const [opening, setOpening] = useState(false)
  const openRequest = useRef<AbortController | null>(null)
  const online = useOnlineStatus()
  useSyncExternalStore(collectionDownloads.subscribe, collectionDownloads.getSnapshot, collectionDownloads.getServerSnapshot)
  const collection = getCollection(search.collection)
  // Existing collection links remain valid without the new variant parameter.
  const variant = collection?.variant ?? search.variant
  const puzzle = collection?.puzzles.find(puzzle => puzzle.id === search.puzzle)
  const difficulties = collection ? collectionDifficulties(collection) : []
  const difficulty = puzzle?.difficulty ?? (search.difficulty && difficulties.includes(search.difficulty) ? search.difficulty : undefined)
  const grids = collection ? collectionDownloads.grids(collection, games) : {}
  const available = !online && collection ? collectionDownloads.available(collection, games) : undefined
  const library = collection && libraryFamily(collection.id)
  const missing = library ? [] : collection?.puzzles.filter(puzzle => !grids[puzzle.id]) ?? []
  const savedGrid = puzzle ? grids[puzzle.id] : undefined
  const canLoad = online || Boolean(puzzle && available?.has(puzzle.id))
  const previewKey = collection && puzzle ? `${collection.id}/${puzzle.id}` : ''
  const [preview, setPreview] = useState<{ key: string; data?: string; error?: string }>()
  const previewGrid = preview?.key === previewKey ? preview.data : undefined
  const previewError = preview?.key === previewKey ? preview.error : undefined
  const [previewAttempt, setPreviewAttempt] = useState(0)
  useEffect(() => () => openRequest.current?.abort(), [])
  useEffect(() => {
    setMessage('')
    return () => openRequest.current?.abort()
  }, [collection?.id, puzzle?.id, difficulty])
  useEffect(() => {
    if (!collection || !puzzle || !canLoad || savedGrid) return
    const request = new AbortController()
    setPreview({ key: previewKey })
    void fetchCollectionGrid(collection, puzzle, request.signal).then(grid => {
      if (!request.signal.aborted) setPreview({ key: previewKey, data: grid })
    }).catch(reason => {
      if (!request.signal.aborted) setPreview({ key: previewKey, error: reason instanceof Error ? reason.message : 'This puzzle could not load.' })
    })
    return () => request.abort()
  }, [collection, puzzle, canLoad, savedGrid, previewAttempt, previewKey])

  async function open(puzzleId: string, play: boolean) {
    if (!collection || openRequest.current) return
    const request = new AbortController()
    openRequest.current = request
    setOpening(true)
    setMessage('')
    try {
      const { added } = await openCollectionPuzzle(collection.id, puzzleId, { online, play, preview: previewGrid, signal: request.signal })
      if (request.signal.aborted) return
      if (play) onPlay()
      else setMessage(!roomStore.getSnapshot().storageAvailable
        ? 'Puzzle available for this session. Local storage is unavailable.'
        : added ? 'Puzzle saved for later.' : 'This puzzle is already in Your puzzles.')
    } catch (reason) {
      if (!request.signal.aborted) setMessage(reason instanceof Error ? reason.message : 'This puzzle could not be opened.')
    } finally {
      openRequest.current = null
      setOpening(false)
    }
  }

  if (search.collection && !collection || search.puzzle && !puzzle) return <section className="main-menu-section">
    <p>This collection or puzzle could not be found.</p>
    <Link to="/puzzles/collections" search={{}} className="button secondary">Browse collections</Link>
  </section>

  const cards = COLLECTIONS.map(collection => {
      const available = online ? undefined : collectionDownloads.available(collection, games)
      return {
        collection,
        count: available?.size ?? collection.puzzles.length,
        difficulties: collectionDifficulties(collection, available),
      }
    }).filter(card => card.count > 0)

  if (!variant) return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
    <CollectionSteps />
    <header><h2 id={`${id}-title`}>Choose a variant</h2><p>Browse collections of Sudoku puzzles.</p></header>
    {cards.length ? <ul className="collection-variant-list" role="list" aria-labelledby={`${id}-title`}>
      {(Object.keys(COLLECTION_VARIANTS) as CollectionVariant[]).map(variant => {
        const collections = cards.filter(card => card.collection.variant === variant)
        if (!collections.length) return null
        const count = collections.reduce((total, card) => total + card.count, 0)
        return <li key={variant}>
          <Link className="collection-card" to="/puzzles/collections" search={{ variant }}>
            <span className="collection-card-icon"><VariantPreview variant={variant} /></span>
            <div className="collection-card-heading">
              <div className="collection-variant-heading">
                <h3>{COLLECTION_VARIANTS[variant]}</h3>
                <span>{collections.length} {collections.length === 1 ? 'collection' : 'collections'} · {count} puzzles{online ? '' : ' available offline'}</span>
              </div>
              <p>{variantDescriptions[variant]}</p>
            </div>
            <ChevronRight className="collection-card-chevron" size={18} aria-hidden="true" />
          </Link>
        </li>
      })}
    </ul> : <p className="collection-note">No collection puzzles available offline. Download puzzles while online to play them here.</p>}
  </section>

  if (!collection) {
    const variantCards = cards.filter(card => card.collection.variant === variant)
    return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
      <CollectionSteps variant={variant} />
      <header><h2 id={`${id}-title`}>Choose a collection</h2><p>{COLLECTION_VARIANTS[variant]} Sudoku</p></header>
      {variantCards.length ? <div className="collection-cards">
        {variantCards.map(({ collection, count, difficulties }) => (
          <Link key={collection.id} className="collection-card" to="/puzzles/collections" search={{ variant, collection: collection.id }}>
            <span className="collection-card-icon"><BookOpen size={21} aria-hidden="true" /></span>
            <div className="collection-card-heading">
              <h3>{collection.title}</h3>
              <span>{count} {count === 1 ? 'puzzle' : 'puzzles'}{online ? '' : ' available offline'}</span>
            </div>
            <ChevronRight className="collection-card-chevron" size={18} aria-hidden="true" />
            <p>{collection.description}</p>
            <small className="collection-card-difficulties">{difficulties.map(difficulty => DIFFICULTY_LABELS[difficulty]).join(' · ')}</small>
          </Link>
        ))}
      </div> : <p className="collection-note">No collection puzzles available offline.</p>}
      <Link to="/puzzles/new" search={{}} className="button secondary collection-action">Generate a new puzzle <ChevronRight size={16} aria-hidden="true" /></Link>
    </section>
  }

  if (!difficulty) return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
    <CollectionSteps variant={variant} collection={collection} />
    <header className="collection-list-header">
      <div><h2 id={`${id}-title`}>Choose difficulty</h2><p>{collection.title}{online ? '' : ' · Offline'}</p></div>
      {online && !library && <DownloadPuzzles collection={collection} missing={missing} games={games} />}
    </header>
    <div className="collection-difficulty-cards">
      {difficulties.map(difficulty => {
        const puzzles = collectionPuzzles(collection, difficulty, available)
        if (!puzzles.length) return null
        const label = DIFFICULTY_LABELS[difficulty]
        return <Link key={difficulty} className="collection-difficulty-card" to="/puzzles/collections" search={{ variant, collection: collection.id, difficulty }}>
          <strong>{label}</strong><span>{puzzles.length} {puzzles.length === 1 ? 'puzzle' : 'puzzles'}</span>
          <small>{online ? '' : 'Available offline'}</small><ChevronRight size={18} aria-hidden="true" />
        </Link>
      })}
    </div>
    {!online && available?.size === 0 && <p className="collection-note">No puzzles from this collection are available offline.</p>}
    <CollectionCredits collection={collection} />
  </section>

  const groupSearch = { ...search, variant, collection: collection.id, difficulty, puzzle: undefined }
  if (puzzle) {
    const existing = findCollectionGame(puzzle, games)
    const solved = existing && isSolved(existing)
    const data = decodeCollectionData(puzzle, savedGrid ?? (canLoad ? previewGrid : undefined))
    return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
      <CollectionSteps variant={variant} collection={collection} difficulty={difficulty} />
      <Link className="collection-back" to="/puzzles/collections" search={groupSearch}>
        <ChevronLeft size={16} aria-hidden="true" /> Back to {DIFFICULTY_LABELS[difficulty].toLowerCase()} puzzles
      </Link>
      <header><h2 id={`${id}-title`}>{puzzle.title}</h2><p>{collection.title} · {difficultyLabel(puzzle)}</p></header>
      {data ? <div className="collection-puzzle-preview">
        <Board label="Collection puzzle preview" givens={data.givens} values={data.givens} variantPuzzle={data.puzzle} showGuides={false} />
        <div className="collection-preview-actions">
          <button type="button" className="button primary" disabled={opening} onClick={() => void open(puzzle.id, true)}>
            <Play size={17} aria-hidden="true" /> {solved ? 'Review puzzle' : existing?.started ? 'Resume puzzle' : 'Start puzzle'}
          </button>
          {!existing && <button type="button" className="button secondary" disabled={opening} onClick={() => void open(puzzle.id, false)}>
            <Bookmark size={17} aria-hidden="true" /> Save for later
          </button>}
          {solved && <p className="collection-note">You solved this puzzle.</p>}
          <a className="collection-note" href={collectionPuzzleSource(collection, puzzle)} target="_blank" rel="noreferrer">Original puzzle and credits</a>
          {data.puzzle && <div className="collection-preview-rules">
            <h3>Rules</h3>
            {variantRuleDescriptions(data.puzzle).map(rule => <p key={rule}>{rule}</p>)}
          </div>}
        </div>
      </div> : !canLoad ? <p className="collection-note">This puzzle is not available offline.</p>
        : previewError ? <div>
          <p role="alert" className="form-error">{previewError}</p>
          <button type="button" className="button secondary" onClick={() => setPreviewAttempt(attempt => attempt + 1)}>Try again</button>
        </div> : <p role="status" className="collection-note">Loading puzzle…</p>}
      {message && <p role="status" className="dialog-status">{message}</p>}
      <CollectionCredits collection={collection} />
    </section>
  }

  const progress = collectionProgress(collection, games, difficulty)
  const all = collectionPuzzles(collection, difficulty, available)
  const puzzles = all.filter(puzzle => !search.status || collectionPuzzleStatus(puzzle, games) === search.status)
  const next = nextCollectionPuzzle(collection, games, difficulty, undefined, available)

  return <section className="main-menu-section collection-section" aria-labelledby={`${id}-title`}>
    <CollectionSteps variant={variant} collection={collection} difficulty={difficulty} />
    <Link className="collection-back" to="/puzzles/collections" search={{ collection: collection.id }}><ChevronLeft size={16} aria-hidden="true" /> Change difficulty</Link>
    <header className="collection-list-header">
      <div><h2 id={`${id}-title`}>{DIFFICULTY_LABELS[difficulty]} puzzles</h2><p>{collection.title}{online ? '' : ' · Offline'}</p></div>
      {library ? <DownloadLibraryLevel key={collection.id + difficulty} collection={collection} difficulty={difficulty} />
        : online && <DownloadPuzzles collection={collection} missing={missing} difficulty={difficulty} games={games} />}
    </header>
    {all.length > 0 && <div className="collection-summary">
      <div><strong>{progress.solved} of {all.length} solved</strong>
        <progress value={progress.solved} max={all.length} aria-label={`${DIFFICULTY_LABELS[difficulty]} puzzles completed`} /></div>
      {next ? <button type="button" disabled={opening} onClick={() => void open(next.id, true)} className="button primary">
        <Play size={16} aria-hidden="true" /> {opening ? 'Loading puzzle…'
          : collectionPuzzleStatus(next, games) === 'in-progress' ? 'Continue collection' : 'Play next puzzle'}
      </button> : <span className="collection-complete"><Check size={18} aria-hidden="true" /> {online ? 'Difficulty complete' : 'Offline puzzles complete'}</span>}
    </div>}
    {message && <p role="status" className="dialog-status">{message}</p>}
    {all.length > 0 && <div className="collection-filters">
      <label>Progress<select value={search.status ?? ''} onChange={event => {
        const status = event.target.value as keyof typeof statusLabels | ''
        void navigate({ to: '/puzzles/collections', search: { ...groupSearch, status: status || undefined }, replace: true })
      }}>
        <option value="">All puzzles</option>
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
    </ol> : <div className="collection-empty"><p>{all.length ? 'No puzzles match this filter.' : 'No puzzles at this difficulty are available offline.'}</p>
      {search.status && <Link to="/puzzles/collections" search={{ collection: collection.id, difficulty }}>Clear filters</Link>}</div>}
    <CollectionCredits collection={collection} />
  </section>
}
