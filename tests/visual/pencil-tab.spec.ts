import { expect, test, type Locator } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

async function expectTabToMeetGrid(tab: Locator) {
  const { distance, tipIsVisible } = await tab.evaluate((element) => {
    const board = element.closest('.board-body')!
    const { top, bottom, left, width } = element.getBoundingClientRect()
    const borderBottom = board.getBoundingClientRect().bottom - parseFloat(getComputedStyle(board, '::after').bottom)
    const tip = element.ownerDocument.elementFromPoint(left + width / 2, bottom - 2)
    return { distance: Math.abs(top - borderBottom), tipIsVisible: element.contains(tip) }
  })
  expect(distance, 'The flat edge should meet the outer edge of the grid border').toBeLessThan(0.5)
  expect(tipIsVisible, 'The part of the tab outside the grid should be visible').toBe(true)
}

test('mobile pencil tab meets the grid border before and after resizing the keypad', async ({ page }) => {
  await page.goto('/iframe.html?id=large-play-worktable--starter&viewMode=story')
  const grid = page.getByRole('grid', { name: 'Sudoku grid' })
  const tab = page.getByRole('button', { name: 'Cycle input mode' })
  await page.getByRole('button', { name: 'Pencil mode', exact: true }).click()
  await expect(grid).toHaveAccessibleDescription('Pencil mode')
  await expect(tab).toHaveAttribute('data-edge', 'bottom')
  await expectTabToMeetGrid(tab)

  // Include the whole tab below the grid while excluding unrelated controls.
  const clip = await grid.evaluate((element) => {
    const { bottom, left, width } = element.getBoundingClientRect()
    return { x: Math.floor(left), y: Math.floor(bottom - 52), width: Math.ceil(width), height: 72 }
  })
  await expect(page).toHaveScreenshot('mobile-pencil-tab.png', { clip, maxDiffPixels: 0 })

  const resizeHandle = page.getByRole('separator', { name: 'Resize puzzle and input panels' })
  const initialHeight = Number(await resizeHandle.getAttribute('aria-valuenow'))
  await resizeHandle.tap()
  const resizeOptions = page.getByRole('dialog', { name: 'Resize input panel' })
  await resizeOptions.getByRole('button', { name: 'Taller' }).tap()
  await expect.poll(async () => Number(await resizeHandle.getAttribute('aria-valuenow'))).toBeGreaterThan(initialHeight)
  await resizeOptions.getByRole('button', { name: 'Close dialog' }).tap()
  await expect(resizeOptions).toBeHidden()
  await expect(resizeHandle).toBeFocused()
  await expectTabToMeetGrid(tab)

  await resizeHandle.press('End')
  await expect(page.locator('.mobile-panel-layout')).toHaveAttribute('data-input-sized', '')
  await expectTabToMeetGrid(tab)
})
