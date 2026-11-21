import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 430, height: 900 }, isMobile: true, hasTouch: true })

test('portrait picture-in-picture space shifts the puzzle and keeps the keypad available', async ({ page }) => {
  await page.goto('/iframe.html?id=large-play-workspace--picture-in-picture-space&viewMode=story')
  const workspace = page.getByRole('main', { name: 'Sudoku workspace' })
  const puzzle = page.getByRole('grid', { name: 'Sudoku grid' })
  const keypad = page.getByRole('group', { name: 'Keypad card' })
  await expect(workspace).toHaveCSS('margin-top', '96px', { timeout: 15000 })
  await expect(keypad).toBeInViewport({ ratio: 1 })
  const paused = page.getByRole('status', { name: 'Puzzle paused' })
  await paused.getByRole('button', { name: 'Resume puzzle' }).tap()
  await expect(puzzle).toBeVisible()
  const reservedTop = (await puzzle.boundingBox())!.y

  await page.getByRole('button', { name: 'Open options menu' }).tap()
  await page.getByRole('button', { name: 'Settings', exact: true }).tap()
  await page.getByRole('link', { name: /^Look & feel/ }).tap()
  const spacing = page.getByRole('combobox', { name: 'Space above puzzle' })
  await expect(spacing).toHaveValue('96')
  await spacing.selectOption('0')
  await page.getByRole('button', { name: 'Close dialog' }).tap()

  await expect(workspace).toHaveCSS('margin-top', '0px')
  await expect.poll(async () => (await puzzle.boundingBox())!.y).toBeCloseTo(reservedTop - 96, 0)
})
