import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowDownToLine, Check, Download, Layers2, Menu, Minus, Plus, Settings as SettingsIcon, Share2, SlidersHorizontal,
} from 'lucide-react'
import { parsePuzzle } from '../sudoku/formats'
import type { ErrorMode } from '../sudoku/game'
import {
  DEFAULT_ADVANCED_MODES, DEFAULT_APPEARANCE, DEFAULT_ERROR_MODE, DEFAULT_INPUT_SIZE, INPUT_SIZE_STEP, MAX_INPUT_SIZE,
  MIN_INPUT_SIZE, readPanelHeight, readPreferences, saveAdvancedModes, saveAppearance, saveErrorMode, saveInputSize,
  savePanelHeight, type AdvancedModes, type AppearancePreferences,
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
  const [appearance, setAppearanceState] = useState<AppearancePreferences>(DEFAULT_APPEARANCE)
  const [errorMode, setErrorModeState] = useState<ErrorMode>(DEFAULT_ERROR_MODE)
  const [inputSize, setInputSizeState] = useState(DEFAULT_INPUT_SIZE)
  const [systemDark, setSystemDark] = useState(false)
  const [panelHeight, setPanelHeight] = useState(280)
  const [resizeMode, setResizeMode] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null)
  const [updating, setUpdating] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const worktableActions = useRef<WorktableActions | null>(null)
  const resizeStartHeight = useRef(panelHeight)
  const resizeStartInputSize = useRef(inputSize)
  const game = games.find((item) => item.id === active)
  const close = () => setPanel(null)
  const colorMode = appearance.colorMode === 'system' ? (systemDark ? 'dark' : 'light') : appearance.colorMode
  const activeTheme = colorMode === 'dark' ? appearance.darkTheme : appearance.lightTheme

  useEffect(() => {
    roomStore.connect()
    const preferences = readPreferences()
    setAdvancedModesState(preferences.advancedModes)
    setAppearanceState(preferences.appearance)
    setErrorModeState(preferences.errorMode)
    setInputSizeState(preferences.inputSize)
    const savedPanelHeight = readPanelHeight()
    if (savedPanelHeight !== null) setPanelHeight(savedPanelHeight)
  }, [])
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.colorMode = colorMode
    root.dataset.theme = activeTheme
    root.style.colorScheme = colorMode
    const background = getComputedStyle(root).getPropertyValue('--page-bg').trim()
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor && background) themeColor.content = background
  }, [activeTheme, colorMode])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const { hostname } = window.location
    const local = import.meta.env.DEV || hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname === '[::1]' || /^127(?:\.\d+){3}$/.test(hostname) || !hostname.includes('.')
    if (local) {
      setUpdateWorker(null)
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())))
      if ('caches' in window) {
        void caches.keys().then((keys) => Promise.all(keys
          .filter((key) => key.startsWith('sudoku-app-shell-') || key.startsWith('gridroom-shell-'))
          .map((key) => caches.delete(key))))
      }
      return
    }
    if (import.meta.env.PROD) {
      let disposed = false
      let reloading = false
      let controlled = Boolean(navigator.serviceWorker.controller)
      const removeInstallingListeners = new Set<() => void>()
      const handleControllerChange = () => {
        if (!controlled) {
          controlled = true
          return
        }
        if (reloading) return
        reloading = true
        window.location.reload()
      }
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

      let removeRegistrationListeners = () => {}
      void navigator.serviceWorker.register('/sw.js').then((registration) => {
        if (disposed) return
        const offer = (worker: ServiceWorker | null) => {
          if (worker && navigator.serviceWorker.controller) setUpdateWorker(worker)
        }
        const watchInstalling = () => {
          const installing = registration.installing
          if (!installing) return
          const handleStateChange = () => {
            if (installing.state === 'installed') offer(registration.waiting ?? installing)
          }
          installing.addEventListener('statechange', handleStateChange)
          removeInstallingListeners.add(() => installing.removeEventListener('statechange', handleStateChange))
        }
        const checkForUpdate = () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => {})
        }
        offer(registration.waiting)
        registration.addEventListener('updatefound', watchInstalling)
        watchInstalling()
        document.addEventListener('visibilitychange', checkForUpdate)
        removeRegistrationListeners = () => {
          registration.removeEventListener('updatefound', watchInstalling)
          document.removeEventListener('visibilitychange', checkForUpdate)
        }
      }).catch(() => { /* Local saves remain available when service workers are blocked. */ })
      return () => {
        disposed = true
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
        removeRegistrationListeners()
        removeInstallingListeners.forEach((remove) => remove())
      }
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

  function setAppearance(next: AppearancePreferences) {
    setAppearanceState(next)
    saveAppearance(next)
  }

  function setErrorMode(next: ErrorMode) {
    setErrorModeState(next)
    saveErrorMode(next)
  }

  function setInputSize(next: number) {
    setInputSizeState(next)
    saveInputSize(next)
  }

  function beginResize() {
    setMenuOpen(false)
    setPanel(null)
    setResizeMode((current) => {
      if (!current) {
        resizeStartHeight.current = panelHeight
        resizeStartInputSize.current = inputSize
      }
      return true
    })
  }

  function cancelResize() {
    setPanelHeight(resizeStartHeight.current)
    setInputSizeState(resizeStartInputSize.current)
    setResizeMode(false)
  }

  function finishResize() {
    savePanelHeight(panelHeight)
    saveInputSize(inputSize)
    setResizeMode(false)
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

  function installUpdate() {
    if (!updateWorker || updating) return
    setUpdating(true)
    updateWorker.postMessage({ type: 'SKIP_WAITING' })
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
              {game?.source === 'draft' && <button onClick={checkPuzzle}><Check size={17} /> Validate puzzle</button>}
              {game && <button className={advancedModes.multiSelectButton ? '' : 'mobile-menu-only'} onClick={toggleMulti} aria-pressed={multi}>
                <Layers2 size={17} /> Multi-select {multi ? 'on' : 'off'}
              </button>}
              {game && game.source !== 'draft' && <button onClick={() => openPanel('share')}><Share2 size={17} /> Share puzzle</button>}
              {game && <button onClick={() => openPanel('manage')}><SettingsIcon size={17} /> Puzzle options</button>}
              <div className="app-menu-separator" />
              <button onClick={() => openPanel('import')}><ArrowDownToLine size={17} /> Import</button>
              <button onClick={() => openPanel('new')}><Plus size={18} /> New puzzle</button>
            </div>}
          </div>
        </div>
      </header>

      <main className={`page ${resizeMode ? 'resize-active' : ''}`} aria-label="Sudoku workspace">
        {!storageAvailable && <p className="workspace-error" role="alert">Local storage is unavailable. Changes may be lost.</p>}
        {linkError && <p className="workspace-error" role="alert">{linkError}</p>}
        <div className="workspace">
          {game ? (
            <Worktable key={`${game.id}-${game.source}`} game={game} modalOpen={panel !== null || menuOpen || resizeMode}
              advancedModes={advancedModes} appearance={appearance} errorMode={errorMode} multi={multi} actionsRef={worktableActions}
              inputSize={inputSize} panelHeight={panelHeight} setPanelHeight={setPanelHeight} beginResize={beginResize}
              onPublish={() => setPanel('publish')} />
          ) : (
            <section className="surface empty-board">
              <h2>Start a Sudoku</h2>
              <button className="button primary" onClick={() => setPanel('new')}><Plus size={18} /> New puzzle</button>
            </section>
          )}
        </div>
      </main>

      {resizeMode && <div className="resize-session-bar" role="region" aria-label="Resize panels">
        <span className="resize-session-copy"><strong>Resize input panel</strong><small>Drag the handle or adjust digit size.</small></span>
        <span className="resize-size-controls" role="group" aria-label="Digit size">
          <button className="icon-button" aria-label="Decrease digit size" disabled={inputSize <= MIN_INPUT_SIZE}
            onClick={() => setInputSizeState(Math.max(MIN_INPUT_SIZE, inputSize - INPUT_SIZE_STEP))}><Minus size={18} /></button>
          <button className="icon-button" aria-label="Increase digit size" disabled={inputSize >= MAX_INPUT_SIZE}
            onClick={() => setInputSizeState(Math.min(MAX_INPUT_SIZE, inputSize + INPUT_SIZE_STEP))}><Plus size={18} /></button>
        </span>
        <span className="resize-session-actions">
          <button className="button secondary" onClick={cancelResize}>Cancel</button>
          <button className="button primary" onClick={finishResize}>Save</button>
        </span>
      </div>}

      {updateWorker && <aside className="update-prompt" role="dialog" aria-labelledby="update-title" aria-describedby="update-description">
        <span className="update-prompt-icon" aria-hidden="true"><Download size={20} /></span>
        <span className="update-prompt-copy">
          <strong id="update-title">App update ready</strong>
          <small id="update-description">A newer offline version is ready to use.</small>
        </span>
        <span className="update-prompt-actions">
          <button className="button secondary" disabled={updating} onClick={() => setUpdateWorker(null)}>Later</button>
          <button className="button primary" disabled={updating} onClick={installUpdate}>{updating ? 'Updating…' : 'Update app'}</button>
        </span>
      </aside>}

      {panel === 'new' && <NewPuzzle close={close} />}
      {panel === 'import' && <ImportPuzzle close={close} onImport={(text, cancelled) => openPuzzle(parsePuzzle(text), cancelled)} />}
      {panel === 'share' && game && <SharePuzzle game={game} close={close} />}
      {panel === 'settings' && <Settings close={close} advancedModes={advancedModes} setAdvancedModes={setAdvancedModes}
        appearance={appearance} setAppearance={setAppearance}
        errorMode={errorMode} setErrorMode={setErrorMode} inputSize={inputSize} setInputSize={setInputSize}
        onResize={beginResize} draft={game?.source === 'draft'} />}
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
