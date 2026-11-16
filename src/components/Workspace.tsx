import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDownToLine, Check, Layers2, Menu, Plus, Settings as SettingsIcon, SlidersHorizontal } from 'lucide-react'
import { parsePuzzle } from '../sudoku/formats'
import type { ErrorMode } from '../sudoku/game'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_ERROR_MODE, readPreferences, saveAdvancedModes, saveErrorMode,
  type AdvancedModes,
} from '../sudoku/preferences'
import { roomStore } from '../sudoku/storage'
import { Modal } from './Modal'
import { ImportPuzzle, NewPuzzle, openPuzzle, PuzzleOptions, SavePuzzle, SharePuzzle, Shortcuts } from './PuzzleDialogs'
import { PuzzleLibrary } from './PuzzleLibrary'
import { Settings } from './Settings'
import { Worktable, type WorktableActions } from './Worktable'

type Panel = 'new' | 'import' | 'share' | 'manage' | 'publish' | 'settings' | 'shortcuts' | 'switch' | null

export function Workspace() {
  const { games, active, storageAvailable } = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot, roomStore.getServerSnapshot)
  const [panel, setPanel] = useState<Panel>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [multi, setMulti] = useState(false)
  const [advancedModes, setAdvancedModesState] = useState<AdvancedModes>(DEFAULT_ADVANCED_MODES)
  const [errorMode, setErrorModeState] = useState<ErrorMode>(DEFAULT_ERROR_MODE)
  const [linkError, setLinkError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const worktableActions = useRef<WorktableActions | null>(null)
  const game = games.find((item) => item.id === active)
  const close = () => setPanel(null)

  useEffect(() => {
    roomStore.connect()
    const preferences = readPreferences()
    setAdvancedModesState(preferences.advancedModes)
    setErrorModeState(preferences.errorMode)
  }, [])
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .catch(() => { /* Local saves remain available when service workers are blocked. */ })
    }
  }, [])
  useEffect(() => {
    let attempt = 0
    async function handleLink() {
      const id = ++attempt
      if (!window.location.hash.startsWith('#puzzle=')) return
      setLinkError('')
      try {
        await openPuzzle(parsePuzzle(window.location.href), () => id !== attempt)
      } catch (error) {
        if (id === attempt) setLinkError((error as Error).message)
      }
      if (id === attempt) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
    void handleLink()
    window.addEventListener('hashchange', handleLink)
    return () => {
      attempt++
      window.removeEventListener('hashchange', handleLink)
    }
  }, [])
  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  function openPanel(nextPanel: Exclude<Panel, null>) {
    setMenuOpen(false)
    setPanel(nextPanel)
  }

  function setAdvancedModes(next: AdvancedModes) {
    setAdvancedModesState(next)
    saveAdvancedModes(next)
  }

  function setErrorMode(next: ErrorMode) {
    setErrorModeState(next)
    saveErrorMode(next)
  }

  function checkPuzzle() {
    setMenuOpen(false)
    worktableActions.current?.check()
  }

  function toggleMulti() {
    setMenuOpen(false)
    setMulti((current) => !current)
  }

  function select(id: string) {
    roomStore.select(id)
    close()
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="wordmark"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>Sudoku</div>
          <div className="topbar-actions" ref={menuRef}>
            <button ref={menuButtonRef} className="icon-button app-menu-trigger" aria-label="Open options menu" title="Options"
              aria-expanded={menuOpen} aria-controls="app-menu" onClick={() => setMenuOpen((open) => !open)}>
              <Menu size={20} />
            </button>
            {menuOpen && <div className="app-menu" id="app-menu">
              <button onClick={() => openPanel('settings')}><SlidersHorizontal size={17} /> Settings</button>
              {game && <button onClick={checkPuzzle}><Check size={17} /> {game.source === 'draft' ? 'Validate puzzle' : 'Check puzzle'}</button>}
              {game && <button className={advancedModes.multiSelectButton ? '' : 'mobile-menu-only'} onClick={toggleMulti} aria-pressed={multi}>
                <Layers2 size={17} /> Multi-select {multi ? 'on' : 'off'}
              </button>}
              {game && <button onClick={() => openPanel('manage')}><SettingsIcon size={17} /> Puzzle options</button>}
              <div className="app-menu-separator" />
              <button onClick={() => openPanel('import')}><ArrowDownToLine size={17} /> Import</button>
              <button onClick={() => openPanel('new')}><Plus size={18} /> New puzzle</button>
            </div>}
          </div>
        </div>
      </header>

      <main className="page" aria-label="Sudoku workspace">
        {!storageAvailable && <p className="workspace-error" role="alert">Local storage is unavailable. Changes may be lost.</p>}
        {linkError && <p className="workspace-error" role="alert">{linkError}</p>}
        <div className="workspace">
          {game ? (
            <Worktable key={`${game.id}-${game.source}`} game={game} modalOpen={panel !== null || menuOpen}
              advancedModes={advancedModes} errorMode={errorMode} multi={multi} actionsRef={worktableActions}
              onShare={() => setPanel('share')} onPublish={() => setPanel('publish')} />
          ) : (
            <section className="surface empty-board">
              <h2>Start a Sudoku</h2>
              <button className="button primary" onClick={() => setPanel('new')}><Plus size={18} /> New puzzle</button>
            </section>
          )}
        </div>
      </main>

      {panel === 'new' && <NewPuzzle close={close} />}
      {panel === 'import' && <ImportPuzzle close={close} onImport={(text, cancelled) => openPuzzle(parsePuzzle(text), cancelled)} />}
      {panel === 'share' && game && <SharePuzzle game={game} close={close} />}
      {panel === 'settings' && <Settings close={close} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
        errorMode={errorMode} setErrorMode={setErrorMode} draft={game?.source === 'draft'} />}
      {panel === 'manage' && game && <PuzzleOptions game={game} close={close}
        onSwitch={games.length > 1 ? () => setPanel('switch') : undefined} onShortcuts={() => setPanel('shortcuts')} />}
      {panel === 'publish' && game?.source === 'draft' && <SavePuzzle game={game} close={close} />}
      {panel === 'shortcuts' && <Shortcuts close={close} />}
      {panel === 'switch' && <Modal title="Switch puzzle" onClose={close}>
        <PuzzleLibrary games={games} active={active} onSelect={select} />
      </Modal>}
    </>
  )
}
