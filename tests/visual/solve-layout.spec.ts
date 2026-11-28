import { expect, test, type Page } from '@playwright/test'

test.use({ reducedMotion: 'no-preference' })

type Bounds = { x: number; y: number; width: number; height: number }

function expectSameBounds(actual: Bounds | null, expected: Bounds | null) {
  expect(actual).not.toBeNull()
  expect(expected).not.toBeNull()
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(actual![key]).toBeCloseTo(expected![key], 1)
  }
}

function waitForPlayMotion(page: Page) {
  return page.evaluate(async () => {
    await new Promise<number>(requestAnimationFrame)
    const animations = document.querySelector('.workspace')!.getAnimations({ subtree: true })
    await Promise.allSettled(animations.map(animation => animation.finished))
  })
}

function capturePlayBounds(page: Page, duringResults = false) {
  return page.evaluateHandle(duringResults => {
    const bounds = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    const frames: [Bounds, Bounds, Bounds | null][] = []
    let frame = requestAnimationFrame(function sample() {
      const card = document.querySelector('.puzzle')
      const results = duringResults ? card?.querySelector('.completion-results') : null
      const surface = results ?? card?.querySelector('.sudoku-grid:not([inert])')
      const toolbar = document.querySelector('.mobile-input-toolbar')
      if (card && surface) frames.push([bounds(card), bounds(surface), toolbar ? bounds(toolbar) : null])
      frame = requestAnimationFrame(sample)
    })
    return () => {
      cancelAnimationFrame(frame)
      return frames
    }
  }, duringResults)
}

const layouts = [
  { name: 'Standard desktop with a hint open', story: 'desktop-panels-after-solve-with-guides',
    viewport: { width: 1280, height: 720 }, hint: true },
  { name: 'Advanced desktop', story: 'advanced-panels-after-solve', viewport: { width: 1440, height: 900 } },
  { name: 'mobile with controls below the grid', story: 'desktop-panels-after-solve-with-bottom-controls',
    viewport: { width: 390, height: 650 }, mobile: true },
  { name: 'mobile with a pinned hint', story: 'desktop-panels-after-solve',
    viewport: { width: 390, height: 650 }, mobile: true, hint: true, pinned: true },
]

for (const { name, story, viewport, mobile, hint, pinned } of layouts) {
  test(`solve results keep the grid in place on ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    if (hint) {
      await page.addInitScript(pinnedHint => {
        localStorage.setItem('sudoku-app:v1:play-preferences', JSON.stringify({ pinnedActions: ['hint'], mobileHintPinned: pinnedHint }))
      }, Boolean(pinned))
    }
    await page.goto(`/iframe.html?id=large-play-worktable--${story}&viewMode=story&embed=true`)
    const puzzle = page.locator('.puzzle')
    const grid = puzzle.getByRole('grid', { name: 'Sudoku grid' })
    const results = puzzle.locator('.completion-results')
    const lastCell = grid.getByRole('gridcell', { name: /^Row 1, column 4, empty/ })
    await expect(lastCell).toBeVisible({ timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    if (hint) {
      await puzzle.getByRole('navigation', { name: 'Pinned puzzle actions' }).getByRole('button', { name: 'Hint' }).click()
      await expect(page.getByRole('button', { name: 'Close hint', exact: true })).toBeVisible()
    }
    await waitForPlayMotion(page)
    await lastCell.click()
    const puzzleBefore = await puzzle.boundingBox()
    const gridBefore = await grid.boundingBox()
    const capture = await capturePlayBounds(page, true)

    await page.keyboard.press('6')
    await expect(puzzle.getByRole('heading', { name: 'Puzzle solved' })).toBeVisible()
    await waitForPlayMotion(page)
    const frames = await capture.evaluate(stop => stop())
    expect(frames.length).toBeGreaterThan(0)
    for (const [puzzleBounds, surfaceBounds] of frames) {
      expectSameBounds(puzzleBounds, puzzleBefore)
      expectSameBounds(surfaceBounds, gridBefore)
    }
    expectSameBounds(await results.boundingBox(), gridBefore)
    if (hint) await expect(page.getByRole('button', { name: 'Close hint', exact: true })).toHaveCount(0)

    await puzzle.getByRole('button', { name: 'View grid' }).click()
    await expect(grid).toBeVisible()
    expectSameBounds(await puzzle.boundingBox(), puzzleBefore)
    expectSameBounds(await grid.boundingBox(), gridBefore)
    await puzzle.getByRole('button', { name: 'View results' }).press('Enter')
    await expect(puzzle.getByRole('heading', { name: 'Puzzle solved' })).toBeVisible()
    expectSameBounds(await puzzle.boundingBox(), puzzleBefore)
    expectSameBounds(await results.boundingBox(), gridBefore)

    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    if (mobile) {
      await expect(undo).toHaveCount(0)
      await puzzle.getByRole('button', { name: 'View grid' }).click()
      await page.getByRole('tab', { name: 'Digits', exact: true }).click()
    } else if (story === 'advanced-panels-after-solve') {
      await page.getByRole('tab', { name: 'Input', exact: true }).click()
    }
    await expect(undo).toBeEnabled()
    await undo.click()
    await expect(lastCell).toBeVisible()
    expectSameBounds(await grid.boundingBox(), gridBefore)
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await expect(redo).toBeEnabled()
    await redo.click()
    await expect(grid.getByRole('gridcell', { name: /^Row 1, column 4, digit 6/ })).toBeVisible()
    await puzzle.getByRole('button', { name: 'View results' }).click()
    await expect(puzzle.getByRole('heading', { name: 'Puzzle solved' })).toBeVisible()
  })
}

const nextPuzzleLayouts = [
  { name: 'mobile with a standalone hint', viewport: { width: 390, height: 700 }, hint: true },
  { name: 'mobile with a pinned hint', viewport: { width: 390, height: 650 }, hint: true, pinned: true },
  { name: 'mobile with a resized input card and tools', viewport: { width: 390, height: 650 }, resized: true },
  { name: 'Standard desktop with a hint', viewport: { width: 1280, height: 720 }, hint: true },
  { name: 'Advanced desktop with a hint', viewport: { width: 1440, height: 900 }, hint: true, advanced: true },
]

for (const { name, viewport, hint, pinned, resized, advanced } of nextPuzzleLayouts) {
  test(`the next puzzle opens at its settled size and position on ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(({ hint, pinned, resized, advanced }) => {
      localStorage.setItem('sudoku-app:v1:puzzle-timing', JSON.stringify({ pauseOnOpen: false }))
      if (advanced) localStorage.setItem('sudoku-app:v1:workspace-mode', 'advanced')
      if (hint) {
        localStorage.setItem('sudoku-app:v1:play-preferences', JSON.stringify({ pinnedActions: ['hint'], mobileHintPinned: pinned }))
      }
      if (resized) {
        localStorage.setItem('sudoku-app:v1:puzzle-tabs:before-next-puzzle', JSON.stringify({
          toolPanels: { open: ['colors', 'chains'], active: 'digits', height: 270 },
        }))
      }
    }, { hint, pinned, resized, advanced })
    await page.goto('/iframe.html?id=large-play-workspace--next-puzzle-after-solve&viewMode=story&embed=true')
    const puzzle = page.locator('.puzzle')
    const grid = puzzle.getByRole('grid', { name: 'Sudoku grid' })
    const lastCell = grid.getByRole('gridcell', { name: /^Row 1, column 4, empty/ })
    const resize = page.getByRole('separator', { name: 'Resize puzzle and input panels' })
    let savedHeight: string | undefined
    await expect(lastCell).toBeVisible({ timeout: 15_000 })
    if (advanced) await expect(page.getByRole('region', { name: 'Advanced workspace panels' })).toBeVisible()
    if (resized) {
      await expect(page.getByRole('tab', { name: 'Chains' })).toBeVisible()
      const layout = page.locator('.mobile-panel-layout')
      await expect(layout).toHaveAttribute('data-input-sized', '')
      await expect.poll(() => layout.evaluate(element => {
        const style = (element as HTMLElement).style
        return parseFloat(style.getPropertyValue('--mobile-resized-input-height')) -
          parseFloat(style.getPropertyValue('--mobile-natural-input-height'))
      })).toBeGreaterThan(0)
      const initialHeight = Number(await resize.getAttribute('aria-valuenow'))
      await resize.press('ArrowDown')
      savedHeight = String(initialHeight - 8)
      await expect(resize).toHaveAttribute('aria-valuenow', savedHeight)
      await page.reload()
      await expect(lastCell).toBeVisible({ timeout: 15_000 })
      await expect(resize).toHaveAttribute('aria-valuenow', savedHeight)
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    if (hint) {
      await puzzle.getByRole('navigation', { name: 'Pinned puzzle actions' }).getByRole('button', { name: 'Hint' }).click()
      await expect(page.getByRole('button', { name: 'Close hint', exact: true })).toBeVisible()
    }
    await waitForPlayMotion(page)
    await lastCell.click()
    await page.keyboard.press('6')
    await expect(puzzle.getByRole('heading', { name: 'Puzzle solved' })).toBeVisible()
    if (savedHeight) await expect(resize).toHaveAttribute('aria-valuenow', savedHeight)
    await waitForPlayMotion(page)

    const capture = await capturePlayBounds(page)
    await page.getByRole('button', { name: 'Next easy puzzle', exact: true }).click()
    await expect(grid).toBeVisible({ timeout: 20_000 })
    if (resized) await expect(page.getByRole('tab', { name: 'Chains' })).toBeVisible()
    if (savedHeight) await expect(resize).toHaveAttribute('aria-valuenow', savedHeight)
    await waitForPlayMotion(page)
    const frames = await capture.evaluate(stop => stop())
    const puzzleAfter = await puzzle.boundingBox()
    const gridAfter = await grid.boundingBox()
    const toolbarAfter = resized ? await page.locator('.mobile-input-toolbar').boundingBox() : null
    expect(frames.length).toBeGreaterThan(0)
    for (const [puzzleBounds, gridBounds, toolbarBounds] of frames) {
      expectSameBounds(puzzleBounds, puzzleAfter)
      expectSameBounds(gridBounds, gridAfter)
      if (resized) expectSameBounds(toolbarBounds, toolbarAfter)
    }
  })
}
