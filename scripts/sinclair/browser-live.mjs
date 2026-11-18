// Use a local production build and fresh browser contexts. Playwright is optional for this study.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

const [origin, output, draws = '4', study = 'medium'] = process.argv.slice(2)
assert.ok(origin && output && Number(draws) >= 0)
assert.ok(['medium', 'impossible'].includes(study))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const offlineOrigin = new URL(origin)
const local = ['localhost', '127.0.0.1'].includes(offlineOrigin.hostname)
// The app clears service workers on localhost. An isolated browser maps this reserved
// hostname to the same loopback server so production offline registration runs normally.
if (local) offlineOrigin.hostname = 'sinclair.test'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: local ? [
  '--host-resolver-rules=MAP sinclair.test 127.0.0.1', '--no-proxy-server',
  '--unsafely-treat-insecure-origin-as-secure=' + offlineOrigin.origin,
] : [] })
const variants = ['classic', 'killer-cages', 'windoku', 'diagonal', 'jigsaw', 'anti-knight', 'thermometer', 'arrow', 'kropki']
const rows = [], errors = [], downloads = []

// Start the next navigation after the previous screen finishes its animation.
async function finishNavigation(page) {
  await page.evaluate(async () => { await document.activeViewTransition?.finished })
}

async function start(page, variant, mode) {
  await finishNavigation(page)
  const checkbox = page.getByRole('checkbox', { name: /^Sinclair (?:collection|generator)$/ })
  await checkbox.setChecked(mode === 'sinclair')
  await page.evaluate(() => {
    const previous = localStorage.getItem('sudoku-app:v1:active')
    window.sinclairTiming = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('The generated game did not appear on the grid.')), 90000)
      document.addEventListener('click', () => {
        const start = performance.now()
        function displayed() {
          const active = localStorage.getItem('sudoku-app:v1:active')
          if (active === previous || !document.querySelector('.sudoku-grid')) return
          const game = JSON.parse(localStorage.getItem('sudoku-app:v1:game:' + active))
          if (!game) return
          const matches = [...document.querySelectorAll('.sudoku-grid')].some(grid => {
            const cells = grid.querySelectorAll('[role="gridcell"]')
            return cells.length === 81 && Array.from(cells, c => c.querySelector('.cell-value')?.textContent ?? '0').join('') === game.givens
          })
          if (!matches) return
          observer.disconnect()
          clearTimeout(deadline)
          resolve({ elapsedMs: performance.now()-start, title: game.title, tier: game.difficulty,
            id: game.variant?.id ?? 'classic', style: game.generationStyle ?? 'standard', givens: game.givens })
        }
        const observer = new MutationObserver(displayed)
        observer.observe(document.body, { subtree: true, childList: true })
      }, { capture: true, once: true })
    })
  })
  await page.locator('.puzzle-start-button:visible').click()
  await page.waitForSelector('.sudoku-grid', { timeout: 90000 })
  const result = await page.evaluate(() => window.sinclairTiming)
  await finishNavigation(page)
  assert.equal(result.tier, study)
  assert.equal(result.id, variant)
  assert.equal(result.style, mode)
  assert.equal(result.title.startsWith('Sinclair '), mode === 'sinclair')
  return result
}

async function desktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  context.setDefaultTimeout(15000)
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/collections/sinclair-library-')) downloads.push(path)
  })
  await page.goto(origin + '/puzzles/new')
  assert.equal(await page.getByRole('checkbox', { name: /^Sinclair (?:collection|generator)$/ }).isChecked(), false)
  const catalog = await page.getByRole('checkbox', { name:'Sinclair collection' }).count() > 0
  assert.equal(downloads.length,0)
  const fetched = new Set()
  const families = study === 'impossible' ? ['classic'] : variants
  for (let draw = 0; draw < Number(draws); draw++) for (const [i, variant] of families.entries()) {
    const modes = study === 'impossible' ? ['sinclair'] : (draw+i)%2 ? ['sinclair','standard'] : ['standard','sinclair']
    for (const mode of modes) {
      await page.locator('.variant-option:visible').filter({ has: page.locator('input[value="' + variant + '"]') }).click()
      await page.locator('.difficulty-list:visible label').filter({ has: page.locator('input[value="' + study + '"]') }).click()
      const before = downloads.length
      const result = await start(page, variant, mode)
      if (catalog) {
        const expected = mode === 'sinclair' && !fetched.has(variant)
        assert.equal(downloads.length-before,Number(expected))
        if (expected) { assert.ok(downloads.at(-1).startsWith('/collections/sinclair-library-' + variant + '/' + study + '-')); fetched.add(variant) }
      }
      rows.push({ mode, draw, packRequests:downloads.length-before, ...result })
      console.log(variant, mode, Math.round(result.elapsedMs), 'ms')
      await page.goBack()
      await page.getByRole('checkbox', { name: /^Sinclair (?:collection|generator)$/ }).waitFor()
      await finishNavigation(page)
    }
  }
  if (catalog && study === 'impossible' && Number(draws) === 100) {
    assert.equal(new Set(rows.map(r => r.title)).size,100)
    assert.equal(new Set(rows.map(r => r.givens)).size,100)
    await page.locator('.puzzle-start-button:visible').click()
    await page.getByRole('alert').filter({hasText:'seen every available'}).waitFor()
    assert.equal(downloads.length,1)
  }
  await context.close()
}

async function mobileOffline() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  context.setDefaultTimeout(15000)
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  const impossible = study === 'impossible'
  const family = impossible ? 'classic' : 'jigsaw'
  await page.goto(offlineOrigin.origin + '/puzzles/new/?step=difficulty&variant=' + family)
  if (impossible) {
    const increase = page.getByRole('button', { name: 'Increase difficulty' })
    while (await increase.isEnabled()) await increase.click()
  }
  await page.getByRole('button', { name: /^(Continue|Done)$/ }).click()
  const toggle = page.getByRole('checkbox', { name: /^Sinclair (?:collection|generator)$/ })
  await toggle.check()
  const ready = () => page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
    undefined, { timeout: 60000 })
  await ready()
  const catalog = await page.getByRole('checkbox', { name:'Sinclair collection' }).count() > 0
  const first = catalog ? await start(page, family, 'sinclair') : undefined
  // Reopen the saved preference in another document controlled by the installed worker.
  const reopened = await context.newPage()
  reopened.on('pageerror', e => errors.push(e.message))
  await reopened.goto(offlineOrigin.origin + '/puzzles/new/')
  await reopened.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 30000 })
  assert.ok(await reopened.getByRole('checkbox', { name: /^Sinclair (?:collection|generator)$/ }).isChecked())
  await context.setOffline(true)
  const game = await start(reopened, family, 'sinclair')
  if (first) assert.notEqual(first.title,game.title)
  await context.close()
  return game
}

try {
  if (Number(draws)) {
    await desktop()
    await writeFile(output, JSON.stringify({ browser: browser.version(), study, draws: Number(draws), rows }, null, 2) + '\n')
  }
  const mobile = await mobileOffline()
  assert.deepEqual(errors, [])
  await writeFile(output, JSON.stringify({ browser: browser.version(), study, draws: Number(draws), rows, downloads, mobileOffline: mobile }, null, 2) + '\n')
  console.log('Verified', rows.length, 'desktop starts and one offline mobile-layout start.')
} finally {
  await browser.close()
}
