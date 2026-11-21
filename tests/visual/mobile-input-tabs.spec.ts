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
