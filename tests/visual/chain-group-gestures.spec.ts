import { expect, test } from '@playwright/test'

const story = '/iframe.html?id=large-play-worktable--candidate-group-gestures&viewMode=story'
const drawingGrid = 'Sudoku grid for drawing links'

test('Shift-click groups the active candidate while preserving a valid link', async ({ page }) => {
  await page.goto(story)
  const panel = page.getByRole('region', { name: 'Chains' })
  const toolbar = panel.locator('.chain-panel-tools')
  const drawing = toolbar.getByRole('button', { name: 'Done drawing' })
  const display = toolbar.getByRole('button', { name: 'Chain display options' })
  await expect(drawing).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  expect((await drawing.boundingBox())!.x).toBeLessThan((await display.boundingBox())!.x)
  await expect(panel.getByRole('button', { name: 'Create group' })).toHaveCount(0)
  const grid = page.getByRole('grid', { name: drawingGrid })
  const first = grid.getByRole('button', { name: /^2 in row 1, column 3\b/ })
  const second = grid.getByRole('button', { name: /^2 in row 1, column 4\b/ })
  const previous = grid.getByRole('button', { name: /^2 in row 1, column 9\b/ })
  await previous.focus()
  await previous.press('Enter')
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await second.click({ modifiers: ['Shift'] })
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(second).toHaveAttribute('aria-pressed', 'true')
  await expect(grid).toHaveAccessibleDescription(/2 in row 1, column 3 or 2 in row 1, column 4/i)

  await page.getByRole('button', { name: 'Undo edit' }).click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(second).toHaveAttribute('aria-pressed', 'false')
  await second.press('Shift+Enter')
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(second).toHaveAttribute('aria-pressed', 'true')
})

test.describe('touch grouping', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('a candidate hold creates a group and consumes the release click', async ({ page }) => {
    await page.goto(story)
    const toolbar = page.getByRole('region', { name: 'Chains' }).locator('.chain-panel-tools')
    const drawing = toolbar.getByRole('button', { name: 'Done drawing' })
    const display = toolbar.getByRole('button', { name: 'Chain display options' })
    await expect(drawing).toBeVisible({ timeout: 20000 })
    const drawingBox = (await drawing.boundingBox())!
    const displayBox = (await display.boundingBox())!
    expect(drawingBox.width).toBe(displayBox.width)
    expect(drawingBox.height).toBe(displayBox.height)
    expect(drawingBox.x + drawingBox.width).toBeLessThanOrEqual(displayBox.x)
    expect(drawingBox.y).toBe(displayBox.y)
    await drawing.tap()
    const startDrawing = toolbar.getByRole('button', { name: 'Draw links' })
    await expect(startDrawing).toHaveAttribute('aria-pressed', 'false', { timeout: 15000 })
    await startDrawing.tap()
    const grid = page.getByRole('grid', { name: drawingGrid })
    const first = grid.getByRole('button', { name: /^2 in row 1, column 3\b/ })
    const second = grid.getByRole('button', { name: /^2 in row 1, column 4\b/ })
    await first.tap()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    const bounds = (await second.boundingBox())!
    const touch = await page.context().newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    ] })
    await expect(second).toHaveAttribute('aria-pressed', 'true')
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(second).toHaveAttribute('aria-pressed', 'true')
    await expect(grid).toHaveAccessibleDescription(/2 in row 1, column 3 or 2 in row 1, column 4/i)
  })
})
