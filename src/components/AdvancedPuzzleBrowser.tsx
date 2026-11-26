import { Button } from './Button'
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArchiveRestore, BookmarkMinus, BookmarkPlus, Dices, FileUp, Save } from 'lucide-react'
import { formatPuzzleRating } from '../sudoku/difficulty'
import { formatTime, isPuzzleSaved, isSolved, valuesOf, type Game } from '../sudoku/game'
import { usePresentContent } from './Presence'
import { useActionMenuKeyboard } from './useActionMenuKeyboard'
import { PuzzleRowContent } from './PuzzleRowContent'

export type PuzzleBrowserView = 'active' | 'past' | 'saved'

function puzzleStatus(game: Game) {
  if (game.source === 'draft') return game.editingId ? 'Editing saved puzzle' : 'Draft puzzle'
  const rating = game.difficulty ? formatPuzzleRating(game.difficulty, game.score) : 'Unrated'
  if (isSolved(game)) return game.timeUntracked ? `${rating} · Solved` : `${rating} · Solved in ${formatTime(game.elapsed)}`
  if (game.started) return `${rating} · ${game.timeUntracked ? 'In progress' : formatTime(game.elapsed)}`
  return `${rating} · Not started`
}

export function AdvancedPuzzleBrowser({ games, active, view, onViewChange, onSelect, onNew, onImport, onSave,
  onSavePuzzle, onUnsavePuzzle, onArchivePuzzle, onRestorePuzzle }: {
  games: Game[]
  active: string | null
  view: PuzzleBrowserView
  onViewChange: (view: PuzzleBrowserView) => void
  onSelect: (id: string) => void
  onNew: () => void
  onImport: () => void
  onSave: () => void
  onSavePuzzle: (id: string) => void
  onUnsavePuzzle: (id: string) => void
  onArchivePuzzle: (id: string) => void
  onRestorePuzzle: (id: string) => void
}) {
  const [menu, setMenu] = useState<{ game: Game; x: number; y: number; opener: HTMLButtonElement } | null>(null)
  const { content: shownMenu, exiting: menuExiting } = usePresentContent(menu)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeViewButton = useRef<HTMLButtonElement>(null)
  const focusAfterClose = useRef<HTMLElement | null>(null)
  const restoreFocusAfterClose = useRef(false)
  const activeGame = games.find((game) => game.id === active)
  const visible = view === 'past'
    ? games.filter((game) => (isSolved(game) || game.archived) && !isPuzzleSaved(game))
    : view === 'active'
      ? games.filter((game) => !isSolved(game) && !isPuzzleSaved(game) && !game.archived)
      : games.filter(isPuzzleSaved)

  const onMenuKeyDown = useActionMenuKeyboard({
    open: Boolean(menu && !menuExiting),
    menuRef,
    onDismiss: reason => {
      if (reason === 'escape') closeMenu(true)
      else {
        closeMenu()
        menu?.opener.focus({ preventScroll: true })
      }
    },
    stopEscapePropagation: true,
  })

  useEffect(() => {
    if (shownMenu || !restoreFocusAfterClose.current) return
    restoreFocusAfterClose.current = false
    const target = focusAfterClose.current
    focusAfterClose.current = null
    const fallback = activeViewButton.current
    ;(target?.isConnected ? target : fallback)?.focus({ preventScroll: true })
  }, [shownMenu])

  useEffect(() => {
    if (!shownMenu) return
    function close(event: globalThis.PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return
      focusAfterClose.current = null
      restoreFocusAfterClose.current = false
      setMenu(null)
    }
    function blur() {
      focusAfterClose.current = null
      restoreFocusAfterClose.current = false
      setMenu(null)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('blur', blur)
    }
  }, [menu, menuExiting, shownMenu])

  function closeMenu(returnFocus = false) {
    if (returnFocus && menu) {
      focusAfterClose.current = menu.opener
      restoreFocusAfterClose.current = true
    } else {
      focusAfterClose.current = null
      restoreFocusAfterClose.current = false
    }
    setMenu(null)
  }

  function openMenu(game: Game, x: number, y: number, opener: HTMLButtonElement) {
    if (view === 'past' && (isSolved(game) || !game.archived)) return
    const width = 190
    const height = view === 'active' ? 92 : 50
    focusAfterClose.current = null
    restoreFocusAfterClose.current = false
    setMenu({
      game,
      x: Math.max(6, Math.min(x, window.innerWidth - width - 6)),
      y: Math.max(6, Math.min(y, window.innerHeight - height - 6)),
      opener,
    })
  }

  function contextMenu(game: Game, event: MouseEvent<HTMLButtonElement>) {
    if (view === 'past' && (isSolved(game) || !game.archived)) return
    event.preventDefault()
    openMenu(game, event.clientX, event.clientY, event.currentTarget)
  }

  function contextMenuKey(game: Game, event: KeyboardEvent<HTMLButtonElement>) {
    if (view === 'past' && (isSolved(game) || !game.archived) || !(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    openMenu(game, bounds.left + Math.min(bounds.width, 44), bounds.top + Math.min(bounds.height, 36), event.currentTarget)
  }

  function act(action: (id: string) => void) {
    if (!menu) return
    focusAfterClose.current = menu.opener
    restoreFocusAfterClose.current = true
    action(menu.game.id)
    setMenu(null)
  }

  return <section className="advanced-puzzle-browser" aria-label="Puzzle browser">
    <header className="advanced-browser-heading">
      <h2>Puzzles</h2>
    </header>
    <div className="advanced-browser-actions">
      <Button onClick={onNew}><Dices size={16} /> New puzzle</Button>
      <Button onClick={onImport}><FileUp size={16} aria-hidden="true" /> Import puzzle</Button>
      {activeGame?.source === 'draft' && <Button variant="primary" onClick={onSave}><Save size={16} /> Save puzzle</Button>}
    </div>
    <div className="advanced-browser-tabs" role="group" aria-label="Puzzle browser views">
      {(['active', 'past', 'saved'] as const).map((item) => <button key={item} ref={view === item ? activeViewButton : undefined} aria-pressed={view === item}
        onClick={() => onViewChange(item)}>{item === 'active' ? 'Active' : item === 'past' ? 'Past' : 'Saved'}</button>)}
    </div>
    {visible.length ? <ul className="advanced-browser-list" key={view}>
      {visible.map((game) => <li key={game.id}>
        <button onClick={() => onSelect(game.id)} onContextMenu={(event) => contextMenu(game, event)}
          onKeyDown={(event) => contextMenuKey(game, event)}
          aria-haspopup={view !== 'past' || game.archived && !isSolved(game) ? 'menu' : undefined}
          aria-current={game.id === active ? 'true' : undefined}>
          <PuzzleRowContent values={valuesOf(game)} size={game.grid?.size} title={game.title} detail={puzzleStatus(game)} />
        </button>
      </li>)}
    </ul> : <p className="advanced-browser-empty" key={view}>{view === 'active' ? 'No active puzzles.' : view === 'past' ? 'No completed puzzles yet.' : 'No saved puzzles.'}</p>}
    {shownMenu && createPortal(<div ref={menuRef} className="puzzle-context-menu motion-surface" role="menu" aria-label={`${shownMenu.game.title} actions`}
      style={{ left: shownMenu.x, top: shownMenu.y }} data-presence={menuExiting ? 'exit' : 'open'}
      inert={menuExiting || undefined} aria-hidden={menuExiting || undefined}
      onKeyDown={onMenuKeyDown}>
      {view === 'active' ? <>
        <button role="menuitem" tabIndex={-1} onClick={() => act(onSavePuzzle)}><BookmarkPlus size={16} /> Save puzzle</button>
        <button role="menuitem" tabIndex={-1} onClick={() => act(onArchivePuzzle)}><Archive size={16} /> Remove from Active</button>
      </> : view === 'saved'
        ? <button role="menuitem" tabIndex={-1} onClick={() => act(onUnsavePuzzle)}><BookmarkMinus size={16} /> Unsave puzzle</button>
        : <button role="menuitem" tabIndex={-1} onClick={() => act(onRestorePuzzle)}><ArchiveRestore size={16} /> Move to Active</button>}
    </div>, document.body)}
  </section>
}
