import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 430, height: 900 }, isMobile: true, hasTouch: true })

test('a short window fits the grid and digits and restores the saved keypad height on expansion', async ({ page }) => {
  await page.goto('/iframe.html?id=large-play-worktable--split-screen&viewMode=story')
  const grid = page.getByRole('grid', { name: 'Sudoku grid' })
  const keypad = page.getByRole('group', { name: 'Digit pad' })
  const pins = page.getByRole('navigation', { name: 'Pinned puzzle actions' })
  const input = page.getByRole('group', { name: 'Input card' })
  const resize = page.getByRole('separator', { name: 'Resize puzzle and input panels' })
  await expect(resize).toHaveAttribute('aria-valuenow', '340', { timeout: 15000 })

  await page.setViewportSize({ width: 430, height: 784 })
  await expect(grid).toBeInViewport({ ratio: 1 })
  await expect(pins).toBeInViewport({ ratio: 1 })
  await expect(input).toBeInViewport({ ratio: 1 })
  await expect(keypad).toBeInViewport({ ratio: 1 })

  await page.setViewportSize({ width: 430, height: 595 })
  await expect(grid).toBeInViewport({ ratio: 1 })
  await expect(keypad).toBeInViewport({ ratio: 1 })
  await expect(resize).not.toHaveAttribute('aria-valuenow', '340')
  const nine = keypad.getByRole('button', { name: 'Select 9', exact: true })
  await expect.poll(async () => (await nine.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await nine.tap()
  await expect(keypad.getByRole('button', { name: 'Deselect 9' })).toHaveAttribute('aria-pressed', 'true')

  const chainsTab = page.getByRole('tab', { name: 'Chains' })
  await chainsTab.tap()
  await expect(chainsTab).toHaveAttribute('aria-selected', 'true')
  const digitsTab = page.getByRole('tab', { name: 'Digits' })
  await digitsTab.press('Enter')
  await expect(keypad).toBeInViewport({ ratio: 1 })

  await page.setViewportSize({ width: 412, height: 570 })
  await expect(grid).toBeInViewport({ ratio: 1 })
  await expect(keypad).toBeInViewport({ ratio: 1 })

  for (const height of [506, 454]) {
    await page.setViewportSize({ width: 430, height })
    await expect(grid).toBeInViewport({ ratio: 1 })
    await expect(keypad).toBeInViewport({ ratio: 1 })
    await expect(input).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Erase mode', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(pins).toBeInViewport({ ratio: 1 })
    await expect.poll(async () => {
      const footer = (await pins.boundingBox())!
      const board = (await grid.boundingBox())!
      const card = (await input.boundingBox())!
      const rows = await pins.getByRole('button').evaluateAll(buttons =>
        new Set(buttons.map(button => button.getBoundingClientRect().top)).size)
      return footer.y >= board.y + board.height && footer.x + footer.width <= card.x && rows > 1
    }).toBe(true)
  }

  await page.setViewportSize({ width: 600, height: 454 })
  await expect(pins).toHaveCSS('display', 'flex')

  await page.setViewportSize({ width: 430, height: 360 })
  await expect(keypad).not.toBeInViewport({ ratio: 1 })
  await keypad.scrollIntoViewIfNeeded()
  await expect(keypad).toBeInViewport({ ratio: 1 })

  await page.setViewportSize({ width: 430, height: 900 })
  await expect(resize).toHaveAttribute('aria-valuenow', '340')
  await expect(grid).toBeInViewport({ ratio: 1 })
  await expect(keypad).toBeInViewport({ ratio: 1 })
})
