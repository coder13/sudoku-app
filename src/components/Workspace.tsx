import { useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowDownToLine, CloudOff, HardDrive, Keyboard, LibraryBig, Plus, WifiOff } from 'lucide-react'
import { parsePuzzle } from '../sudoku/formats'
import { roomStore } from '../sudoku/storage'
import { ImportPuzzle, NewPuzzle, openPuzzle, PuzzleOptions, SavePuzzle, SharePuzzle, Shortcuts } from './PuzzleDialogs'
import { PuzzleLibrary } from './PuzzleLibrary'
import { Worktable } from './Worktable'

type Panel = 'new' | 'import' | 'share' | 'manage' | 'publish' | 'shortcuts' | null

function useOffline() {
  const [offline, setOffline] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const worker = import.meta.env.PROD && 'serviceWorker' in navigator ? navigator.serviceWorker : null
    const workerUrl = new URL('/sw.js', window.location.origin).href
    const updateReady = () => setReady(worker?.controller?.scriptURL === workerUrl)
    if (worker) {
      worker.addEventListener('controllerchange', updateReady)
      updateReady()
      worker.register(workerUrl)
        .catch(() => { /* Local saves remain available when service workers are blocked. */ })
    }
    return () => {
      worker?.removeEventListener('controllerchange', updateReady)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return { offline, ready }
}

export function Workspace() {
  const { games, active, storageAvailable } = useSyncExternalStore(roomStore.subscribe, roomStore.getSnapshot, roomStore.getServerSnapshot)
  const [panel, setPanel] = useState<Panel>(null)
  const [linkError, setLinkError] = useState('')
  const { offline, ready } = useOffline()
  const game = games.find((item) => item.id === active)
  const close = () => setPanel(null)

  useEffect(() => roomStore.connect(), [])
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

  function select(id: string) {
    roomStore.select(id)
    if (window.matchMedia('(max-width: 760px)').matches) {
      document.getElementById('current-puzzle')?.scrollIntoView({ block: 'start' })
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="wordmark"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>Sudoku</div>
          <div className="topbar-actions">
            <button className="button secondary import-button" onClick={() => setPanel('import')}><ArrowDownToLine size={17} /> Import</button>
            <button className="button primary" onClick={() => setPanel('new')}><Plus size={18} /> New puzzle</button>
          </div>
        </div>
      </header>

      <main className="page">
        <div className="page-heading">
          <h1>Sudoku workspace</h1>
          <a className="button secondary jump-library" href="#my-puzzles" aria-label="My puzzles" title="My puzzles"><LibraryBig size={17} /></a>
          <div className="workspace-status">
            <span className="device-pill"><span className="device-dot" />{offline ? 'Offline' : ready ? 'Offline ready' : 'On this device'}</span>
            <button className="icon-button keyboard-button" onClick={() => setPanel('shortcuts')} title="Keyboard shortcuts" aria-label="Keyboard shortcuts"><Keyboard size={19} /></button>
          </div>
        </div>
        {linkError && <p className="workspace-error" role="alert">{linkError}</p>}
        <div className={`workspace ${game ? '' : 'no-active'}`}>
          {game ? (
            <Worktable key={`${game.id}-${game.source}`} game={game} modalOpen={panel !== null}
              onShare={() => setPanel('share')} onManage={() => setPanel('manage')} onPublish={() => setPanel('publish')} />
          ) : (
            <section className="surface empty-board" id="current-puzzle">
              <h2>Start a Sudoku</h2>
              <button className="button primary" onClick={() => setPanel('new')}><Plus size={18} /> New puzzle</button>
            </section>
          )}
          <PuzzleLibrary games={games} active={active} onSelect={select} onNew={() => setPanel('new')} />
        </div>

        <footer className="page-footer">
          <span role={storageAvailable ? undefined : 'alert'}>{storageAvailable ? <><HardDrive size={15} /> Progress saved on this device</> : <><WifiOff size={15} /> Local storage is unavailable. Changes may be lost.</>}</span>
          {ready && <span><CloudOff size={15} /> {offline ? 'Playing offline' : 'Available offline'}</span>}
        </footer>
      </main>

      {panel === 'new' && <NewPuzzle close={close} />}
      {panel === 'import' && <ImportPuzzle close={close} onImport={(text, cancelled) => openPuzzle(parsePuzzle(text), cancelled)} />}
      {panel === 'share' && game && <SharePuzzle game={game} close={close} />}
      {panel === 'manage' && game && <PuzzleOptions game={game} close={close} />}
      {panel === 'publish' && game?.source === 'draft' && <SavePuzzle game={game} close={close} />}
      {panel === 'shortcuts' && <Shortcuts close={close} />}
    </>
  )
}
