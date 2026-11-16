import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArchiveRestore, BookmarkMinus, BookmarkPlus, Dices, PencilLine, Save } from 'lucide-react'
import { formatPuzzleRating } from '../sudoku/difficulty'
import { formatTime, isPuzzleSaved, isSolved, valuesOf, type Game } from '../sudoku/game'

export type PuzzleBrowserView = 'active' | 'past' | 'saved'

function MiniGrid({ game }: { game: Game }) {
  return <span className="mini-grid" aria-hidden="true">
    {[...valuesOf(game)].map((digit, index) => <i key={index} data-filled={digit !== '0'} />)}
  </span>
}

function puzzleStatus(game: Game) {
  if (game.source === 'draft') return game.editingId ? 'Editing saved puzzle' : 'Draft puzzle'
  const rating = game.difficulty ? formatPuzzleRating(game.difficulty, game.score) : 'Unrated'
  if (isSolved(game)) return `${rating} · Solved in ${formatTime(game.elapsed)}`
  if (game.started) return `${rating} · ${formatTime(game.elapsed)}`
  return `${rating} · Not started`
}

export function AdvancedPuzzleBrowser({ games, active, view, onViewChange, onSelect, onNew, onCreate, onSave, onEdit,
  onSavePuzzle, onUnsavePuzzle, onArchivePuzzle, onRestorePuzzle }: {
  games: Game[]
  active: string | null
  view: PuzzleBrowserView
  onViewChange: (view: PuzzleBrowserView) => void
  onSelect: (id: string) => void
  onNew: () => void
  onCreate: () => void
  onSave: () => void
  onEdit: () => void
  onSavePuzzle: (id: string) => void
  onUnsavePuzzle: (id: string) => void
  onArchivePuzzle: (id: string) => void
  onRestorePuzzle: (id: string) => void
}) {
  const [menu, setMenu] = useState<{ game: Game; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeGame = games.find((game) => game.id === active)
  const visible = view === 'past'
    ? games.filter((game) => (isSolved(game) || game.archived) && !isPuzzleSaved(game))
    : view === 'active'
      ? games.filter((game) => !isSolved(game) && !isPuzzleSaved(game) && !game.archived)
      : games.filter(isPuzzleSaved)

  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    function close(event: globalThis.PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    function keydown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }
    function blur() {
      setMenu(null)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', keydown)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('blur', blur)
    }
  }, [menu])

  function openMenu(game: Game, x: number, y: number) {
    if (view === 'past' && (isSolved(game) || !game.archived)) return
    const width = 190
    const height = view === 'active' ? 92 : 50
    setMenu({
      game,
      x: Math.max(6, Math.min(x, window.innerWidth - width - 6)),
      y: Math.max(6, Math.min(y, window.innerHeight - height - 6)),
    })
  }

  function contextMenu(game: Game, event: MouseEvent<HTMLButtonElement>) {
    if (view === 'past' && (isSolved(game) || !game.archived)) return
    event.preventDefault()
    openMenu(game, event.clientX, event.clientY)
  }

  function contextMenuKey(game: Game, event: KeyboardEvent<HTMLButtonElement>) {
    if (view === 'past' && (isSolved(game) || !game.archived) || !(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    openMenu(game, bounds.left + Math.min(bounds.width, 44), bounds.top + Math.min(bounds.height, 36))
  }

  function act(action: (id: string) => void) {
    if (!menu) return
    action(menu.game.id)
    setMenu(null)
  }

  return <section className="advanced-puzzle-browser" aria-label="Puzzle browser">
    <header className="advanced-browser-heading">
      <div><h2>Puzzles</h2><p>Switch puzzles or open the puzzle editor.</p></div>
    </header>
    <div className="advanced-browser-actions">
      <button className="button secondary" onClick={onNew}><Dices size={16} /> New puzzle</button>
      <button className="button secondary" onClick={onCreate}><PencilLine size={16} /> Create puzzle</button>
      {activeGame?.source === 'draft'
        ? <button className="button primary" onClick={onSave}><Save size={16} /> Save puzzle</button>
        : activeGame?.source === 'custom' && <button className="button secondary" onClick={onEdit}><PencilLine size={16} /> Edit puzzle</button>}
    </div>
    <div className="advanced-browser-tabs" role="tablist" aria-label="Puzzle browser views">
      {(['active', 'past', 'saved'] as const).map((item) => <button key={item} role="tab" aria-selected={view === item}
        onClick={() => onViewChange(item)}>{item === 'active' ? 'Active' : item === 'past' ? 'Past' : 'Saved'}</button>)}
    </div>
    {visible.length ? <ul className="advanced-browser-list">
      {visible.map((game) => <li key={game.id}>
        <button onClick={() => onSelect(game.id)} onContextMenu={(event) => contextMenu(game, event)}
          onKeyDown={(event) => contextMenuKey(game, event)}
          aria-haspopup={view !== 'past' || game.archived && !isSolved(game) ? 'menu' : undefined}
          aria-current={game.id === active ? 'true' : undefined}>
          <MiniGrid game={game} />
          <span><strong>{game.title}</strong><small>{puzzleStatus(game)}</small></span>
        </button>
      </li>)}
    </ul> : <p className="advanced-browser-empty">{view === 'active' ? 'No active puzzles.' : view === 'past' ? 'No completed puzzles yet.' : 'No saved puzzles.'}</p>}
    {menu && createPortal(<div ref={menuRef} className="puzzle-context-menu" role="menu" aria-label={`${menu.game.title} actions`}
      style={{ left: menu.x, top: menu.y }}>
      {view === 'active' ? <>
        <button role="menuitem" onClick={() => act(onSavePuzzle)}><BookmarkPlus size={16} /> Save puzzle</button>
        <button role="menuitem" onClick={() => act(onArchivePuzzle)}><Archive size={16} /> Remove from Active</button>
      </> : view === 'saved'
        ? <button role="menuitem" onClick={() => act(onUnsavePuzzle)}><BookmarkMinus size={16} /> Unsave puzzle</button>
        : <button role="menuitem" onClick={() => act(onRestorePuzzle)}><ArchiveRestore size={16} /> Move to Active</button>}
    </div>, document.body)}
  </section>
}
