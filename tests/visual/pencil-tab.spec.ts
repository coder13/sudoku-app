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

test('a Pencil group clears matching marks and adds the full group on the next tap', async ({ page }) => {
  await page.goto('/iframe.html?id=large-play-worktable--starter&viewMode=story')
  const pencil = page.getByRole('button', { name: 'Pencil mode', exact: true })
  const pad = page.getByRole('group', { name: 'Digit pad' })
  const cell = page.locator('[role="gridcell"][data-cell="2"]')
  const marks = cell.locator('.board-candidate')
  await pencil.tap()
  await pad.locator('.key').filter({ hasText: /^2$/ }).tap()
  await cell.tap()
  await expect(marks).toHaveText(['2'])
  await page.keyboard.press('Shift+Digit4')
  await expect(pencil).toHaveAttribute('aria-pressed', 'true')
  const four = pad.locator('.key').filter({ hasText: /^4$/ })
  await expect(four).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Shift+Digit4')
  await expect(four).toHaveAttribute('aria-pressed', 'false')

  const touch = await page.context().newCDPSession(page)
  const keyBox = (await four.boundingBox())!
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: keyBox.x + keyBox.width / 2, y: keyBox.y + keyBox.height / 2 }],
  })
  await expect(four).toHaveAttribute('aria-pressed', 'true')
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(pencil).toHaveAttribute('aria-pressed', 'true')

  await cell.tap()
  await expect(marks).toHaveCount(0)
  await cell.tap()
  await expect(marks).toHaveText(['2', '4'])
  await page.getByRole('button', { name: 'Undo', exact: true }).tap()
  await expect(marks).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).tap()
  await expect(marks).toHaveText(['2'])
})

test('selecting several digits keeps the current input mode', async ({ page }) => {
  await page.goto('/iframe.html?id=large-play-worktable--starter&viewMode=story')
  const grid = page.getByRole('grid', { name: 'Sudoku grid' })
  const pad = page.getByRole('group', { name: 'Digit pad' })
  const highlight = page.getByRole('button', { name: 'Highlight mode', exact: true })
  const expectSelected = (digits: string[]) => expect(pad.locator('.key[aria-pressed="true"]')).toHaveText(digits)
  await expect(grid).toHaveAccessibleDescription('Pen mode')

  await page.keyboard.press('Shift+Digit2')
  await page.keyboard.press('Shift+Digit4')
  await expectSelected(['2', '4'])
  await expect(grid).toHaveAccessibleDescription('Pen mode')

  await page.getByRole('button', { name: 'Pencil mode', exact: true }).tap()
  await page.keyboard.press('Shift+Digit6')
  await expectSelected(['2', '4', '6'])
  await expect(grid).toHaveAccessibleDescription('Pencil mode')

  await highlight.tap()
  await page.keyboard.press('Shift+Digit8')
  await expectSelected(['2', '4', '6', '8'])
  await expect(grid).toHaveAccessibleDescription('Highlight mode')
  await highlight.tap()
  await expect(grid).toHaveAccessibleDescription('Pencil mode')
})
