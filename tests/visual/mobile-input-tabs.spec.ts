import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('the selected Chains tab shows a single outline when focused', async ({ page }) => {
  await page.goto('/iframe.html?id=large-play-worktable--starter&viewMode=story')
  await page.getByRole('button', { name: 'Input tools', exact: true }).tap()
  const tools = page.getByRole('group', { name: 'Input tools' })
  await tools.getByRole('button', { name: 'Colors', exact: true }).tap()
  await tools.getByRole('button', { name: 'Chains', exact: true }).tap()
  await page.keyboard.press('Escape')

  const tabs = page.getByRole('tablist', { name: 'Sudoku input' })
  const chains = tabs.getByRole('tab', { name: 'Chains' })
  await chains.tap()
  await expect(chains).toHaveAttribute('aria-selected', 'true')
  await expect(chains).toHaveCSS('outline-style', 'none')
  await expect(chains).toHaveCSS('box-shadow', /inset/)

  const colors = tabs.getByRole('tab', { name: 'Colors' })
  await colors.tap()
  await colors.press('ArrowRight')
  await expect(chains).toBeFocused()
  await expect(chains).toHaveAttribute('aria-selected', 'true')
  await expect(chains).toHaveCSS('outline-width', '2px')
  await expect(chains).toHaveCSS('box-shadow', 'none')
  await expect(tabs).toHaveScreenshot('focused-chains-tab.png', { maxDiffPixels: 0 })
})

test('touch swipes page between Digits and a tool without activating the starting control', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/iframe.html?id=large-play-worktable--starter&viewMode=story')
  await page.getByRole('button', { name: 'Input tools', exact: true }).tap()
  const tools = page.getByRole('group', { name: 'Input tools' })
  await tools.getByRole('button', { name: 'Techniques', exact: true }).tap()
  await page.keyboard.press('Escape')

  const tabs = page.getByRole('tablist', { name: 'Sudoku input' })
  const digits = tabs.getByRole('tab', { name: 'Digits' })
  const techniques = tabs.getByRole('tab', { name: 'Techniques' })
  await digits.tap()
  const key = page.getByRole('group', { name: 'Digit pad' }).getByRole('button', { name: / 3$/ })
  const pressed = await key.getAttribute('aria-pressed')

  const touch = await page.context().newCDPSession(page)
  const viewport = page.locator('.mobile-input-panels')
  async function swipe(x: number, y: number, distance: number, entering: 'techniques' | 'digits') {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    // Cross the capture threshold before crossing the distance needed to switch tabs.
    for (let step = 1; step <= 12; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: x + distance * step / 12, y }],
      })
    }
    const incoming = viewport.locator(`[id$="-panel-${entering}"]`)
    // The real neighboring content must intersect the card while the finger
    // is still down, even though it remains inert until the swipe commits.
    await expect(incoming).toHaveAttribute('inert', '')
    await expect.poll(async () => {
      const bounds = (await viewport.boundingBox())!
      const content = (await incoming.locator(entering === 'digits' ? '.keypad' : 'table').boundingBox())!
      return Math.min(bounds.x + bounds.width, content.x + content.width) - Math.max(bounds.x, content.x)
    }).toBeGreaterThan(8)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  const keyBox = (await key.boundingBox())!
  await swipe(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2, -145, 'techniques')
  await expect(techniques).toHaveAttribute('aria-selected', 'true')

  const panel = page.getByRole('tabpanel', { name: 'Techniques' })
  const panelBox = (await panel.boundingBox())!
  await swipe(panelBox.x + panelBox.width / 4, panelBox.y + panelBox.height / 2, 145, 'digits')
  await expect(digits).toHaveAttribute('aria-selected', 'true')
  await expect(key).toHaveAttribute('aria-pressed', pressed!)
})
