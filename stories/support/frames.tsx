import { Button } from '../../src/components/Button'
import { createContext, useContext, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { SudokuShell, Workspace } from '../../src/components/Workspace'
import { isSyncStep } from '../../src/sudoku/sync-steps'
import { LearnLayout } from '../../src/routes/learn'
import { LessonPage } from '../../src/routes/learn.$technique'
import { LessonOverview } from '../../src/routes/learn.index'
import { Route as ImportRoute } from '../../src/routes/import'
import { Route as NewPuzzleRoute } from '../../src/routes/puzzles.new'
import { Route as GameTypesRoute } from '../../src/routes/puzzles.games'
import { KakuroDifficultyPage, KakuroPlay } from '../../src/components/Kakuro'
import { CalcudokuDifficultyPage, CalcudokuPlay } from '../../src/components/Calcudoku'
import { FutoshikiDifficultyPage, FutoshikiPlay } from '../../src/components/Futoshiki'
import { HidatoDifficultyPage, HidatoPlay } from '../../src/components/Hidato'
import { kakuroCatalog } from '../../src/kakuro/catalog'
import { calcudokuCatalog } from '../../src/calcudoku/catalog'
import { futoshikiCatalog } from '../../src/futoshiki/catalog'
import { hidatoCatalog } from '../../src/hidato/catalog'
import type { NumberGame } from '../../src/components/NumberPuzzle'

export const noop = () => {}

export function Width({ children, width = 600, stage = false }: { children: ReactNode; width?: number; stage?: boolean }) {
  return <div className={`story-width${stage ? ' story-stage' : ''}`} style={{ '--story-width': `${width}px` } as CSSProperties}>{children}</div>
}

export function LessonFrame({ children }: { children: ReactNode }) {
  return <div className="learn-page story-learn"><div className="learn-content">{children}</div></div>
}

export function DialogStory({ label, children, initialOpen = true }: {
  label: string
  children: (close: () => void) => ReactNode
  initialOpen?: boolean
}) {
  const [open, setOpen] = useState(initialOpen)
  return <>
    <Button onClick={() => setOpen(true)}>{label}</Button>
    {open && children(() => setOpen(false))}
  </>
}

// Keep the actual route IDs and links, but let Storybook own the document and browser history.
const StorySlot = createContext<ReactNode>(undefined)
const IndexSlot = () => useContext(StorySlot) ?? <Workspace />
const LearnSlot = () => useContext(StorySlot) ?? <LearnLayout />

export function PreviewRouter({ children, path = '/', shell = false }: {
  children?: ReactNode; path?: string; shell?: boolean
}) {
  const [router] = useState(() => {
    const root = createRootRoute({
      component: () => shell ? <SudokuShell><Outlet /></SudokuShell> : <Outlet />,
    })
    const index = createRoute({ getParentRoute: () => root, path: '/', component: IndexSlot })
    const settings = createRoute({ getParentRoute: () => root, path: 'settings', component: Workspace })
    const settingsSection = createRoute({ getParentRoute: () => settings, path: '$section' })
    const sync = createRoute({ getParentRoute: () => settings, path: 'device-sync' })
    const syncStep = createRoute({
      getParentRoute: () => sync, path: '$step',
      loader: ({ params }) => isSyncStep(params.step) ? params.step : undefined,
    })
    const importPuzzle = createRoute({ getParentRoute: () => root, path: 'import', component: ImportRoute.options.component })
    const puzzles = createRoute({ getParentRoute: () => root, path: 'puzzles' })
    const standalone = { standalonePuzzlePage: true }
    const gameTypes = createRoute({
      getParentRoute: () => puzzles, path: 'games',
      staticData: standalone, component: GameTypesRoute.options.component,
    })

    function numberGame<Entry extends { id: string }>(path: NumberGame, Difficulty: ComponentType,
      Play: ComponentType<{ entry: Entry }>, entries: readonly Entry[]) {
      const choose = createRoute({ getParentRoute: () => puzzles, path, staticData: standalone, component: () => <Difficulty /> })
      const play = createRoute({
        getParentRoute: () => puzzles, path: `${path}/$puzzle`, staticData: standalone,
        loader: ({ params }) => entries.find(entry => entry.id === params.puzzle) ?? entries[0],
      })
      return [choose, play.update({ component: () => <Play entry={play.useLoaderData()} /> })]
    }

    const numberGames = [
      ...numberGame('kakuro', KakuroDifficultyPage, KakuroPlay, kakuroCatalog),
      ...numberGame('calcudoku', CalcudokuDifficultyPage, CalcudokuPlay, calcudokuCatalog),
      ...numberGame('futoshiki', FutoshikiDifficultyPage, FutoshikiPlay, futoshikiCatalog),
      ...numberGame('hidato', HidatoDifficultyPage, HidatoPlay, hidatoCatalog),
    ]
    const newPuzzle = createRoute({
      getParentRoute: () => puzzles, path: 'new',
      validateSearch: NewPuzzleRoute.options.validateSearch,
    })
    const difficulty = createRoute({ getParentRoute: () => newPuzzle, path: 'difficulty' })
    const custom = createRoute({ getParentRoute: () => newPuzzle, path: 'custom' })
    const save = createRoute({ getParentRoute: () => newPuzzle, path: 'save' })
    const learn = createRoute({
      getParentRoute: () => root,
      path: 'learn',
      component: LearnSlot,
    })
    const overview = createRoute({ getParentRoute: () => learn, path: '/', component: LessonOverview })
    const lesson = createRoute({
      getParentRoute: () => learn,
      path: '$technique',
      loader: ({ params }) => params.technique,
      component: LessonPage,
      notFoundComponent: () => null,
    })
    return createRouter({
      routeTree: root.addChildren([
        index, settings.addChildren([settingsSection, sync.addChildren([syncStep])]), importPuzzle,
        puzzles.addChildren([newPuzzle.addChildren([difficulty, custom, save]), gameTypes, ...numberGames]), learn.addChildren([overview, lesson]),
      ]),
      history: createMemoryHistory({ initialEntries: [path] }),
      defaultPreload: false,
    })
  })
  // Treat the story contents as a live slot so Controls can update props without resetting the route.
  return <StorySlot.Provider value={children}><RouterProvider router={router} /></StorySlot.Provider>
}
