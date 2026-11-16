import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { SudokuShell, Workspace } from '../../src/components/Workspace'
import { LearnLayout } from '../../src/routes/learn'
import { LessonPage } from '../../src/routes/learn.$technique'
import { LessonOverview } from '../../src/routes/learn.index'

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
    <button className="button secondary" onClick={() => setOpen(true)}>{label}</button>
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
      routeTree: root.addChildren([index, learn.addChildren([overview, lesson])]),
      history: createMemoryHistory({ initialEntries: [path] }),
      defaultPreload: false,
    })
  })
  // Treat the story contents as a live slot so Controls can update props without resetting the route.
  return <StorySlot.Provider value={children}><RouterProvider router={router} /></StorySlot.Provider>
}
