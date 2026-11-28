import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { PuzzlesPage } from '../../src/components/PuzzlesPage'
import { Route as NewPuzzleRoute } from '../../src/routes/puzzles.new'
import type { NewPuzzlePreference } from '../../src/sudoku/preferences'

/** Render actual New Puzzle screens with their real search validator and in-memory routing. */
export async function renderNewPuzzle(path: string, preference: NewPuzzlePreference = { variant: 'classic', difficulty: 'medium' }, preferencesReady = true) {
  const root = createRootRoute({ component: () => <PuzzlesPage games={[]} active={null} setDifficulty={() => {}}
    newPuzzlePreference={preference} rememberNewPuzzle={() => {}} preferencesReady={preferencesReady} loadingPuzzles={false} /> })
  const puzzles = createRoute({ getParentRoute: () => root, path: 'puzzles' })
  const choice = createRoute({ getParentRoute: () => puzzles, path: 'new', validateSearch: NewPuzzleRoute.options.validateSearch })
  const custom = createRoute({ getParentRoute: () => choice, path: 'custom' })
  const difficulty = createRoute({ getParentRoute: () => choice, path: 'difficulty' })
  const save = createRoute({ getParentRoute: () => choice, path: 'save' })
  const router = createRouter({ routeTree: root.addChildren([puzzles.addChildren([choice.addChildren([custom, difficulty, save])])]),
    history: createMemoryHistory({ initialEntries: [path] }), defaultPreload: false })
  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}
